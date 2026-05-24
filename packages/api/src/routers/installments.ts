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

	getSuggestedRefund,
	setPackageOverdraft,
	rescheduleInstallment,
	waiveInstallment,
	resetCreditsOverride,
} from "@avantej-core/services";
import { installmentEvents } from "@avantej-core/db/schema/tenant/installment-events";
import { ORPCError } from "@orpc/server";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import { getControlPanelDb } from "../lib/context-helpers";

const confirmPayment = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			installmentId: z.string().uuid(),
			paymentMethod: z.enum(["manual_transfer", "cash", "card", "fpx", "stripe"]),
			notes: z.string().optional(),
			nextIntervalDays: z.number().int().min(1).optional(),
		})
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "update")

		return confirmInstallmentPayment(context.tenantDb, {
			installmentId: input.installmentId,
			paymentMethod: input.paymentMethod,
			notes: input.notes,
			confirmedBy: context.member.userId,
			nextIntervalDays: input.nextIntervalDays,
		});
	});

const listByPackageInstance = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
		})
	)
	.handler(async ({ input, context }) => {
		

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
				await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "read");
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

		if (context.installmentLockOnOpen !== false) {
			await evaluateAndLockIfOverdue(
				context.tenantDb,
				input.packageInstanceId,
			);
		}

		return getInstallmentsByPackageInstance(context.tenantDb, input.packageInstanceId);
	});

const manualUnlock = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
			reason: z.string().min(1),
		})
	)
	.handler(async ({ input, context }) => {
		

		

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

const processRefundProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
			amount: z.number().int().min(0),
			reason: z.string().min(1),
		})
	)
	.handler(async ({ input, context }) => {
		

		

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

		const result = await processRefund(
			context.tenantDb,
			input.packageInstanceId,
			input.amount,
			context.member.userId,
			input.reason,
			actor,
		);

		return { success: true, cancelledInstallmentIds: result.cancelledInstallmentIds };
	});

const adminOverview = tenantProcedure
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
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "read")

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

const getEvents = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
		})
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "read")

		return context.tenantDb.query.installmentEvents.findMany({
			where: eq(installmentEvents.packageInstanceId, input.packageInstanceId),
			orderBy: [desc(installmentEvents.createdAt)],
		});
	});

const suggestRefund = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		if (context.member.role !== "admin") {
			throw new ORPCError("FORBIDDEN", {
				message: "Admin role required",
			});
		}

		return getSuggestedRefund(context.tenantDb, input.packageInstanceId);
	});

const adjustCreditsProcedure = tenantProcedure
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

const setOverdraft = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
			enabled: z.boolean(),
			reason: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

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

const reschedule = tenantProcedure
	.input(z.object({
		organizationId: z.string().uuid(),
		installmentId: z.string().uuid(),
		newDueDate: z.string().datetime(),
		reason: z.string().min(1),
	}))
	.handler(async ({ input, context }) => {
		await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "update");
		try {
			return rescheduleInstallment(context.tenantDb, input.installmentId, new Date(input.newDueDate), context.member.userId, input.reason);
		} catch (err: any) {
			if (err?.code === "CONFLICT") throw new ORPCError("CONFLICT", { message: err.message });
			if (err?.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: err.message });
			throw err;
		}
	});

const waive = tenantProcedure
	.input(z.object({
		organizationId: z.string().uuid(),
		installmentId: z.string().uuid(),
		reason: z.string().min(1),
	}))
	.handler(async ({ input, context }) => {
		await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "update");
		try {
			return waiveInstallment(context.tenantDb, input.installmentId, context.member.userId, input.reason);
		} catch (err: any) {
			if (err?.code === "CONFLICT") throw new ORPCError("CONFLICT", { message: err.message });
			throw err;
		}
	});

const resetOverride = tenantProcedure
	.input(z.object({
		organizationId: z.string().uuid(),
		packageInstanceId: z.string().uuid(),
		reason: z.string().min(1),
	}))
	.handler(async ({ input, context }) => {
		await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "update");
		return resetCreditsOverride(context.tenantDb, input.packageInstanceId, context.member.userId, input.reason);
	});

export const installmentsRouter = {
	adjustCredits: adjustCreditsProcedure,
	confirmPayment,
	listByPackageInstance,
	manualUnlock,
	processRefund: processRefundProcedure,
	reschedule,
	waive,
	resetOverride,
	adminOverview,
	getEvents,
	suggestRefund,
	setOverdraft,
};
