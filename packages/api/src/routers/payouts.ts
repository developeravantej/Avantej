/**
 * Payouts Router
 *
 * API endpoint for listing payouts with recipient enrichment from control panel.
 */

import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import { eq, and, desc, inArray, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission } from "@avantej-core/services";
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
					"user_management",
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

			const payoutRows = await context.tenantDb
				.select()
				.from(payouts)
				.where(conditions.length > 0 ? and(...conditions) : undefined)
				.orderBy(desc(payouts.createdAt))
				.limit(input.limit);

			if (payoutRows.length === 0) {
				return [];
			}

			// Enrich with recipient names:
			// 1. Get member records by recipientId (which is members.userId)
			const recipientIds = [
				...new Set(payoutRows.map((p) => p.recipientId)),
			];

			// recipientId references members.userId, so find member records
			const memberRows = await context.tenantDb
				.select({ userId: members.userId })
				.from(members)
				.where(inArray(members.userId, recipientIds));

			const userIds = memberRows.map((m) => m.userId);

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

			return payoutRows.map((p) => ({
				id: p.id,
				recipientId: p.recipientId,
				recipientName: userMap.get(p.recipientId) ?? "Unknown",
				amount: p.amount,
				status: p.status,
				paidAt: p.paidAt,
				appointmentId: p.appointmentId,
				createdAt: p.createdAt,
				// Agent 2.5 — J5 commission audit: surface batch grouping
				batchId: p.batchId,
			}));
		}),
};
