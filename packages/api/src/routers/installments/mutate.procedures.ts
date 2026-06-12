/**
 * Installments Router — mutation procedures
 *
 * Write paths: payment confirmation, manual unlock, refunds, credit
 * adjustments, overdraft toggle, reschedule, waive, override reset.
 */

import {
	adjustCredits,
	confirmInstallmentPayment,
	unlockPackage,
	processRefund,
	setPackageOverdraft,
	rescheduleInstallment,
	waiveInstallment,
	resetCreditsOverride,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";

const confirmPayment = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			installmentId: z.string().uuid(),
			paymentMethod: z.enum([
				"manual_transfer",
				"cash",
				"card",
				"fpx",
				"stripe",
			]),
			notes: z.string().optional(),
			nextIntervalDays: z.number().int().min(1).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"update",
		);

		return confirmInstallmentPayment(context.tenantDb, {
			installmentId: input.installmentId,
			paymentMethod: input.paymentMethod,
			notes: input.notes,
			confirmedBy: context.member.userId,
			nextIntervalDays: input.nextIntervalDays,
		});
	});

const manualUnlock = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
			reason: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"update",
		);

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
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"update",
		);

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

		return {
			success: true,
			cancelledInstallmentIds: result.cancelledInstallmentIds,
		};
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
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"update",
		);

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
			throw new ORPCError(
				code === "BAD_REQUEST" ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
				{
					message:
						err instanceof Error ? err.message : "Failed to adjust credits",
				},
			);
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
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"update",
		);

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
	.input(
		z.object({
			organizationId: z.string().uuid(),
			installmentId: z.string().uuid(),
			newDueDate: z.string().datetime(),
			reason: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		// LC-M1: reschedule requires installment write permission
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"update",
		);
		try {
			return rescheduleInstallment(
				context.tenantDb,
				input.installmentId,
				new Date(input.newDueDate),
				context.member.userId,
				input.reason,
			);
		} catch (err: any) {
			if (err?.code === "CONFLICT")
				throw new ORPCError("CONFLICT", { message: err.message });
			if (err?.code === "BAD_REQUEST")
				throw new ORPCError("BAD_REQUEST", { message: err.message });
			throw err;
		}
	});

const waive = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			installmentId: z.string().uuid(),
			reason: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		// LC-M1: waive requires installment write permission
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"update",
		);
		try {
			return waiveInstallment(
				context.tenantDb,
				input.installmentId,
				context.member.userId,
				input.reason,
			);
		} catch (err: any) {
			if (err?.code === "CONFLICT")
				throw new ORPCError("CONFLICT", { message: err.message });
			throw err;
		}
	});

const resetOverride = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			packageInstanceId: z.string().uuid(),
			reason: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"service_management",
			"update",
		);
		return resetCreditsOverride(
			context.tenantDb,
			input.packageInstanceId,
			context.member.userId,
			input.reason,
		);
	});

export const installmentMutateProcedures = {
	confirmPayment,
	manualUnlock,
	processRefund: processRefundProcedure,
	adjustCredits: adjustCreditsProcedure,
	setOverdraft,
	reschedule,
	waive,
	resetOverride,
};
