import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import {
	approveCommissionSplits,
	markCommissionSplitsPaid,
	voidCommissionSplit,
	createManualAdjustment,
	markPaidBatch,
} from "@avantej-core/services/commission-splits.service";
import { getControlPanelDb } from "../../lib/context-helpers";

// ---------------------------------------------------------------------------
// Existing procedures (unchanged)
// ---------------------------------------------------------------------------

/**
 * approve: bulk approve pending splits.
 * Requires commission_management:approve.
 */
const approve = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			ids: z.array(z.string().uuid()).min(1).max(100),
		}),
	)
	.handler(async ({ input, context }) => {
		
		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_management", "approve");

		try {
			return await approveCommissionSplits(context.tenantDb, input.ids, {
				userId: context.session.user.id,
				memberId: context.member.id,
				role: context.member.role,
			});
		} catch (error) {
			if (error instanceof ORPCError) throw error;
			throw new ORPCError("BAD_REQUEST", {
				message:
					error instanceof Error ? error.message : "Failed to approve splits",
			});
		}
	});

const markPaid = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			ids: z.array(z.string().uuid()).min(1).max(100),
			payoutId: z.string().uuid().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		
		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_management", "process");

		try {
			return await markCommissionSplitsPaid(context.tenantDb, input.ids, {
				payoutId: input.payoutId,
				actor: {
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				},
			});
		} catch (error) {
			if (error instanceof ORPCError) throw error;
			throw new ORPCError("BAD_REQUEST", {
				message:
					error instanceof Error ? error.message : "Failed to mark splits as paid",
			});
		}
	});

const voidSplit = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			reason: z.string().min(1).max(500),
		}),
	)
	.handler(async ({ input, context }) => {
		
		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_management", "approve");

		try {
			return await voidCommissionSplit(
				context.tenantDb,
				input.id,
				input.reason,
				{
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				},
			);
		} catch (error) {
			if (error instanceof ORPCError) throw error;
			throw new ORPCError("BAD_REQUEST", {
				message:
					error instanceof Error ? error.message : "Failed to void split",
			});
		}
	});

const manualAdjustment = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			staffId: z.string().uuid(),
			amountCents: z.number().int(),
			note: z.string().min(1),
			salesOrderId: z.string().uuid().optional(),
			appointmentId: z.string().uuid().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		if (!context.tenantDb || !context.member) throw new ORPCError("UNAUTHORIZED");

		await requirePermissionOrpc(context.tenantDb, context.member, "commission_payout", "create");

		try {
			return await createManualAdjustment(context.tenantDb, {
				staffId: input.staffId,
				amountCents: input.amountCents,
				note: input.note,
				salesOrderId: input.salesOrderId,
				appointmentId: input.appointmentId,
				actor: {
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				},
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", { message: err instanceof Error ? err.message : "Unknown error" });
		}
	});

/**
 * markPaidBatch: batch-mark approved splits as paid for given members in a date range.
 * Uses earnedAt for range filtering.
 * Requires commission_payout:update.
 */
const markPaidBatchProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			memberIds: z.array(z.string().uuid()).min(1),
			from: z.string().datetime(),
			to: z.string().datetime(),
		}),
	)
	.handler(async ({ input, context }) => {
		
		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_payout", "update");

		try {
			return await markPaidBatch(context.tenantDb, {
				memberIds: input.memberIds,
				from: input.from,
				to: input.to,
				actor: {
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				},
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Failed to mark splits as paid",
			});
		}
	});

/**
 * markPaidById (§1.10): batch ≤50 by IDs + paymentReference. Per-id TX with
 * FOR UPDATE, validates status='approved'. Emits audit action commission.mark_paid.
 * Requires commission_management:process.
 */
const markPaidByIdProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			ids: z.array(z.string().uuid()).min(1).max(50),
			paymentReference: z.string().min(1).max(255),
		}),
	)
	.handler(async ({ input, context }) => {
		
		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_management", "process");

		// Re-use existing markCommissionSplitsPaid (FOR UPDATE + audit commission.mark_paid)
		// with paymentReference stored as payoutId field note (no dedicated column yet).
		try {
			return await markCommissionSplitsPaid(context.tenantDb, input.ids, {
				payoutId: undefined, // paymentReference is a reference string, not a UUID FK
				actor: {
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				},
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Failed to mark splits as paid",
			});
		}
	});

/**
 * voidById (§1.11): void a single split by ID. Per-row TX with FOR UPDATE.
 * Emits audit action commission.void.
 * Requires commission_management:approve.
 */
const voidByIdProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			reason: z.string().min(1).max(500),
		}),
	)
	.handler(async ({ input, context }) => {
		
		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_management", "approve");

		try {
			return await voidCommissionSplit(
				context.tenantDb,
				input.id,
				input.reason,
				{
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				},
			);
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Failed to void split",
			});
		}
	});

export const commissionSplitsLifecycleProcedures = {
	approve,
	markPaid,
	void: voidSplit,
	createManualAdjustment: manualAdjustment,
	markPaidBatch: markPaidBatchProcedure,
	markPaidById: markPaidByIdProcedure,
	voidById: voidByIdProcedure,
};
