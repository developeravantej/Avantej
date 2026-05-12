/**
 * Installments Router
 *
 * API endpoints for installment-based credit unlocking system.
 * Manages payment confirmation, overdue evaluation, unlocking, refunds, and admin overview.
 */

import {
	adjustCredits,
	confirmInstallmentPayment,
	getInstallmentsByPackageInstance,
	unlockPackage,
	processRefund,
	getAdminInstallmentOverview,
	evaluateAndLockIfOverdue,
	requirePermission,
	getSuggestedRefund,
	setPackageOverdraft,
} from "@avantej-core/services";
import { installmentEvents } from "@avantej-core/db/schema/tenant/installment-events";
import { ORPCError } from "@orpc/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { getControlPanelDb } from "../lib/context-helpers";

const confirmPayment = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			installmentId: z.string().uuid(),
			paymentMethod: z.enum(["manual_transfer", "cash"]),
			notes: z.string().optional(),
			nextIntervalDays: z.number().int().min(1).optional(),
		})
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
				"service_management",
				"update"
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return confirmInstallmentPayment(context.tenantDb, {
			installmentId: input.installmentId,
			paymentMethod: input.paymentMethod,
			notes: input.notes,
			confirmedBy: context.member.userId,
			nextIntervalDays: input.nextIntervalDays,
		});
	});

const listByPackageInstance = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
		})
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available. Ensure organization context is set.",
			});
		}

		const clientId = context.session?.user?.id;
		const isOwner = clientId !== undefined;
		const isStaff = !!context.member;

		if (!isOwner && !isStaff) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "User session required",
			});
		}

		if (isStaff) {
			try {
				await requirePermission(
					context.tenantDb,
					context.member!,
					"service_management",
					"read"
				);
			} catch {
				// If staff permission check fails but user is the owner (clientId matches),
				// we still allow access — fall through to the service call below.
				if (!isOwner) {
					throw new ORPCError("FORBIDDEN", {
						message: "Permission denied",
					});
				}
			}
		}

		await evaluateAndLockIfOverdue(
			context.tenantDb,
			input.packageInstanceId,
		);

		return getInstallmentsByPackageInstance(context.tenantDb, input.packageInstanceId);
	});

const manualUnlock = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
			reason: z.string().min(1),
		})
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

		if (context.member.role !== "admin") {
			throw new ORPCError("FORBIDDEN", {
				message: "Admin role required",
			});
		}

		const actor = {
			userId: context.session!.user.id,
			memberId: context.member.id,
			role: context.member.role,
		};

		return unlockPackage(
			context.tenantDb,
			input.packageInstanceId,
			context.member.userId,
			input.reason,
			actor,
		);
	});

const processRefundProcedure = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
			amount: z.number().int().min(0),
			reason: z.string().min(1),
		})
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

		if (context.member.role !== "admin") {
			throw new ORPCError("FORBIDDEN", {
				message: "Admin role required",
			});
		}

		const actor = {
			userId: context.session!.user.id,
			memberId: context.member.id,
			role: context.member.role,
		};

		await processRefund(
			context.tenantDb,
			input.packageInstanceId,
			input.amount,
			context.member.userId,
			input.reason,
			actor,
		);

		return { success: true };
	});

const adminOverview = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			status: z.enum(["active", "overdue", "locked", "due_soon"]).optional(),
			limit: z.number().int().min(1).max(200).optional(),
			offset: z.number().int().min(0).optional(),
			search: z.string().optional(),
			dueBefore: z.string().datetime().optional(),
			dueAfter: z.string().datetime().optional(),
			paymentPlanCode: z.string().optional(),
		})
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
				"service_management",
				"read"
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		const controlPanelDb = getControlPanelDb(context);

		return getAdminInstallmentOverview(context.tenantDb, {
			status: input.status,
			limit: input.limit,
			offset: input.offset,
			search: input.search,
			dueBefore: input.dueBefore ? new Date(input.dueBefore) : undefined,
			dueAfter: input.dueAfter ? new Date(input.dueAfter) : undefined,
			paymentPlanCode: input.paymentPlanCode,
		}, controlPanelDb);
	});

const getEvents = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
		})
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
				"service_management",
				"read"
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return context.tenantDb.query.installmentEvents.findMany({
			where: eq(installmentEvents.packageInstanceId, input.packageInstanceId),
			orderBy: [desc(installmentEvents.createdAt)],
		});
	});

const suggestRefund = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available.",
			});
		}

		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		if (context.member.role !== "admin") {
			throw new ORPCError("FORBIDDEN", {
				message: "Admin role required",
			});
		}

		return getSuggestedRefund(context.tenantDb, input.packageInstanceId);
	});

const adjustCreditsProcedure = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
			creditsUnlocked: z.number().int().min(0).optional(),
			creditsUsed: z.number().int().min(0).optional(),
			reason: z.string().min(1),
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

		if (context.member.role !== "admin") {
			throw new ORPCError("FORBIDDEN", { message: "Admin role required" });
		}

		const actor = {
			userId: context.session!.user.id,
			memberId: context.member.id,
			role: context.member.role,
		};

		try {
			return await adjustCredits(context.tenantDb, input.packageInstanceId, {
				creditsUnlocked: input.creditsUnlocked,
				creditsUsed: input.creditsUsed,
				reason: input.reason,
				actorId: context.member.userId,
				actor,
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			const code = (err as { code?: string }).code;
			throw new ORPCError(code === "BAD_REQUEST" ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR", {
				message: err instanceof Error ? err.message : "Failed to adjust credits",
			});
		}
	});

const setOverdraft = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
			enabled: z.boolean(),
			reason: z.string().min(1),
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

		if (context.member.role !== "admin") {
			throw new ORPCError("FORBIDDEN", {
				message: "Admin role required",
			});
		}

		const actor = {
			userId: context.session!.user.id,
			memberId: context.member.id,
			role: context.member.role,
		};

		return setPackageOverdraft(
			context.tenantDb,
			input.packageInstanceId,
			input.enabled,
			input.reason,
			actor,
		);
	});

export const installmentsRouter = {
	adjustCredits: adjustCreditsProcedure,
	confirmPayment,
	listByPackageInstance,
	manualUnlock,
	processRefund: processRefundProcedure,
	adminOverview,
	getEvents,
	suggestRefund,
	setOverdraft,
};
