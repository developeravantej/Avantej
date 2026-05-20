/**
 * Payouts Router
 *
 * API endpoint for listing payouts with recipient enrichment from control panel.
 */

import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import { eq, and, desc, inArray, or, isNull, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission } from "@avantej-core/services";
import { previewBatch, processForRecipient, recipientSummary, runBatch } from "@avantej-core/services/payouts.service";
import { getControlPanelDb } from "../lib/context-helpers";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";


export const payoutsRouter = {
	/**
	 * List payouts with optional filters and recipient name enrichment
	 */
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				status: z
					.enum(["pending", "processing", "paid", "failed", "canceled"])
					.optional(),
				recipientId: z.string().optional(),
				limit: z.number().int().min(1).max(200).default(50),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"commission_payout",
					"read"
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

			// Build filter conditions
			const conditions: SQL[] = [];

			if (input.status) {
				conditions.push(eq(payouts.status, input.status));
			}
			if (input.recipientId) {
				conditions.push(eq(payouts.recipientId, input.recipientId));
			}
			if (context.accessibleNodeIds?.length) {
				conditions.push(
					or(
						isNull(payouts.appointmentId),
						inArray(appointments.branchId, context.accessibleNodeIds)
					) as SQL
				);
			}

			const payoutRows = await context.tenantDb
				.select({ payout: payouts })
				.from(payouts)
				.leftJoin(appointments, eq(payouts.appointmentId, appointments.id))
				.where(conditions.length > 0 ? and(...conditions) : undefined)
				.orderBy(desc(payouts.createdAt))
				.limit(input.limit)
				.then((rows: Array<{ payout: typeof payouts.$inferSelect }>) =>
					rows.map((r: { payout: typeof payouts.$inferSelect }) => r.payout),
				);

			if (payoutRows.length === 0) {
				return [];
			}

			// Enrich with recipient names:
			// 1. Get member records by recipientId (which is members.userId)
			const recipientIds = [
				...new Set(payoutRows.map((p: any) => p.recipientId)),
			];

			// recipientId references members.userId, so find member records
			const memberRows = await context.tenantDb
				.select({ userId: members.userId })
				.from(members)
				.where(inArray(members.userId, recipientIds as string[]));

			const userIds = memberRows.map((m: any) => m.userId);

			// 2. Batch-fetch user names from control panel
			const controlPanelDb = context.honoContext?.get(
				"controlPanelDb"
			) as NeonDatabase<typeof controlPanelSchema> | undefined;

			let userMap = new Map<string, string>();

			if (controlPanelDb && userIds.length > 0) {
				const userRows = await controlPanelDb
					.select({ id: user.id, name: user.name })
					.from(user)
					.where(inArray(user.id, userIds));

				for (const u of userRows) {
					userMap.set(u.id, u.name);
				}
			}

			return payoutRows.map((p: any) => ({
				id: p.id,
				recipientId: p.recipientId,
				recipientName: userMap.get(p.recipientId) ?? "Unknown",
				amount: p.amount,
				grossAmountCents: p.grossAmountCents ?? p.amount,
				deductionsCents: p.deductionsCents ?? 0,
				status: p.status,
				paidAt: p.paidAt,
				appointmentId: p.appointmentId,
				createdAt: p.createdAt,
				// Agent 2.5 — J5 commission audit: surface batch grouping
				batchId: p.batchId,
				// Reference / note from the payout description column
				description: p.description ?? null,
				paymentMethod: p.payoutMethod,
			}));
		}),

	/**
	 * Preview a payout batch: returns the set of approved splits that would be
	 * paid for the given staff members in the given date range. No writes.
	 *
	 * Perm: commission_payout:read
	 */
	previewBatch: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				staffIds: z.array(z.string()).min(1).max(50),
				periodStart: z.coerce.date(),
				periodEnd: z.coerce.date(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}
			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"commission_payout",
					"read",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const controlPanelDb = getControlPanelDb(context);

			return previewBatch(context.tenantDb, controlPanelDb, {
				staffIds: input.staffIds,
				periodStart: input.periodStart,
				periodEnd: input.periodEnd,
				branchId: input.branchId,
			});
		}),

	/**
	 * Execute a payout batch: one transaction that locks approved splits, inserts
	 * a payout row per staff member, and marks splits as paid.
	 *
	 * Perm: commission_payout:process
	 */
	runBatch: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				staffIds: z.array(z.string()).min(1).max(50),
				periodStart: z.coerce.date(),
				periodEnd: z.coerce.date(),
				paymentMethod: z.enum(["bank_transfer", "cash", "check", "other"]),
				reference: z.string().max(200).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}
			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"commission_payout",
					"process",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			try {
				return await runBatch(context.tenantDb, {
					staffIds: input.staffIds,
					periodStart: input.periodStart,
					periodEnd: input.periodEnd,
					paymentMethod: input.paymentMethod,
					reference: input.reference,
					paidByUserId: context.member.userId,
				});
			} catch (err) {
				if (err instanceof Error) {
					const code = (err as { code?: string }).code;
					if (code === "EMPTY_BATCH") {
						throw new ORPCError("BAD_REQUEST", {
							message: "No approved splits in range",
						});
					}
					if (code === "CONFLICT") {
						throw new ORPCError("CONFLICT", {
							message: err.message,
						});
					}
				}
				throw err;
			}
		}),

	/**
	 * Lifetime stats for a single payout recipient.
	 *
	 * Admin: any recipientId.
	 * Non-admin: recipientId's member must have hierarchyScopeId ∈ accessibleNodeIds.
	 *
	 * Perm: payouts:read
	 */
	recipientSummary: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				recipientId: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}
			if (!context.member) {
				throw new ORPCError("FORBIDDEN", { message: "User is not a member of this organization" });
			}

			try {
				await requirePermission(context.tenantDb, context.member, "commission_payout", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			// Non-admin: verify the recipient is within the caller's accessible nodes
			if (context.member.role !== "admin" && context.accessibleNodeIds?.length) {
				const [recipientMember] = await context.tenantDb
					.select({ hierarchyScopeId: members.hierarchyScopeId })
					.from(members)
					.where(eq(members.userId, input.recipientId))
					.limit(1);

				if (
					!recipientMember ||
					!context.accessibleNodeIds.includes(recipientMember.hierarchyScopeId)
				) {
					throw new ORPCError("FORBIDDEN", {
						message: "Recipient is not within your accessible scope",
					});
				}
			}

			return recipientSummary(context.tenantDb, input.recipientId);
		}),

	/**
	 * Process a payout batch for a single recipient.
	 *
	 * Thin wrapper over runBatch. periodStart defaults to 1st of current month,
	 * periodEnd defaults to now.
	 *
	 * Perm: commission_payout:process
	 */
	processForRecipient: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				recipientId: z.string(),
				paymentMethod: z.enum(["bank_transfer", "cash", "check", "other"]),
				reference: z.string().max(200).optional(),
				periodStart: z.coerce.date().optional(),
				periodEnd: z.coerce.date().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}
			if (!context.member) {
				throw new ORPCError("FORBIDDEN", { message: "User is not a member of this organization" });
			}

			try {
				await requirePermission(context.tenantDb, context.member, "commission_payout", "process");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			try {
				return await processForRecipient(context.tenantDb, {
					recipientId: input.recipientId,
					paymentMethod: input.paymentMethod,
					reference: input.reference,
					paidByUserId: context.member.userId,
					periodStart: input.periodStart,
					periodEnd: input.periodEnd,
				});
			} catch (err) {
				if (err instanceof Error) {
					const code = (err as { code?: string }).code;
					if (code === "EMPTY_BATCH") {
						throw new ORPCError("BAD_REQUEST", { message: "No approved splits in range" });
					}
					if (code === "CONFLICT") {
						throw new ORPCError("CONFLICT", { message: err.message });
					}
				}
				throw err;
			}
		}),
};
