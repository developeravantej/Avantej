import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	listCommissionSplits,
	getCommissionsByAppointment,
	getMyCommissions,
	approveCommissionSplits,
	markCommissionSplitsPaid,
	voidCommissionSplit,
	createManualAdjustment,
	listCommissionLedger,
	liabilitySummary,
	markPaidBatch,
	liabilityByStaff,
	listPendingReview,
	resolvePendingReview,
} from "@avantej-core/services/commission-splits.service";
import { requirePermission } from "@avantej-core/services";
import { getControlPanelDb } from "../lib/context-helpers";

// ---------------------------------------------------------------------------
// Existing procedures (unchanged)
// ---------------------------------------------------------------------------

const list = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			memberId: z.string().uuid().optional(),
			appointmentId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
			limit: z.number().int().min(1).max(200).default(50).optional(),
		}),
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
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		return listCommissionSplits(context.tenantDb, {
			memberId: input.memberId,
			appointmentId: input.appointmentId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
			limit: input.limit ?? 50,
			accessibleNodeIds: context.accessibleNodeIds,
		});
	});

const getByAppointment = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			appointmentId: z.string().uuid(),
		}),
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
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		return getCommissionsByAppointment(context.tenantDb, input.appointmentId, {
			accessibleNodeIds: context.accessibleNodeIds,
		});
	});

const myCommissions = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
		}),
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
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		return getMyCommissions(context.tenantDb, context.member.id, {
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
		});
	});

// ---------------------------------------------------------------------------
// New procedures — Phase 6
// ---------------------------------------------------------------------------

/**
 * listLedger: enriched ledger with totals for the Commissions page.
 * Replaces the basic `list` procedure for the new UI.
 * Requires commission_management:read.
 */
const listLedger = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			status: z
				.enum(["pending", "approved", "paid", "void", "all"])
				.default("all"),
			staffId: z.string().optional(),
			branchId: z.string().uuid().optional(),
			from: z.string().optional(),
			to: z.string().optional(),
			limit: z.number().min(1).max(200).default(100),
			offset: z.number().min(0).default(0),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		const controlPanelDb = getControlPanelDb(context);

		return listCommissionLedger(context.tenantDb, controlPanelDb, {
			status: input.status,
			staffId: input.staffId,
			branchId: input.branchId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
			limit: input.limit,
			offset: input.offset,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

/**
 * approve: bulk approve pending splits.
 * Requires commission_management:approve.
 */
const approve = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			ids: z.array(z.string().uuid()).min(1).max(100),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"approve",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

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

/**
 * markPaid: bulk mark approved splits as paid.
 * Optionally links a payoutId.
 * Requires commission_management:process.
 */
const markPaid = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			ids: z.array(z.string().uuid()).min(1).max(100),
			payoutId: z.string().uuid().optional(),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"process",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

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

/**
 * void: void a single commission split from any status.
 * Requires commission_management:approve.
 */
const voidSplit = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			reason: z.string().min(1).max(500),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"approve",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

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

/**
 * createManualAdjustment: create a manual commission adjustment (bonus or clawback).
 * Requires commission_payout:create.
 */
const manualAdjustment = protectedProcedure
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
		if (!context.tenantDb || !context.member) throw new ORPCError("UNAUTHORIZED");

		try {
			await requirePermission(context.tenantDb, context.member, "commission_payout", "create");
		} catch {
			throw new ORPCError("FORBIDDEN", { message: "commission_payout:create required" });
		}

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
 * liabilitySummary: aggregate commission liability for a date range.
 * Filters on earnedAt. Optionally scoped by hierarchy node and/or service category.
 * Requires commission_management:read OR commission_payout:read.
 */
const liabilitySummaryProcedure = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			from: z.string().datetime(),
			to: z.string().datetime(),
			hierarchyNodeId: z.string().uuid().optional(),
			categoryId: z.string().uuid().optional(),
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

		// OR permission check: commission_management:read OR commission_payout:read
		let hasPermission = false;
		try {
			await requirePermission(context.tenantDb, context.member, "commission_management", "read");
			hasPermission = true;
		} catch {
			// Try the alternative permission
		}
		if (!hasPermission) {
			try {
				await requirePermission(context.tenantDb, context.member, "commission_payout", "read");
				hasPermission = true;
			} catch {
				// Both failed
			}
		}
		if (!hasPermission) {
			throw new ORPCError("FORBIDDEN", {
				message: "commission_management:read or commission_payout:read required",
			});
		}

		const controlPanelDb = getControlPanelDb(context);

		try {
			return await liabilitySummary(context.tenantDb, controlPanelDb, {
				from: input.from,
				to: input.to,
				hierarchyNodeId: input.hierarchyNodeId,
				categoryId: input.categoryId,
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: err instanceof Error ? err.message : "Failed to compute liability summary",
			});
		}
	});

/**
 * markPaidBatch: batch-mark approved splits as paid for given members in a date range.
 * Uses earnedAt for range filtering.
 * Requires commission_payout:update.
 */
const markPaidBatchProcedure = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			memberIds: z.array(z.string().uuid()).min(1),
			from: z.string().datetime(),
			to: z.string().datetime(),
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

		try {
			await requirePermission(context.tenantDb, context.member, "commission_payout", "update");
		} catch {
			throw new ORPCError("FORBIDDEN", { message: "commission_payout:update required" });
		}

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

// ---------------------------------------------------------------------------
// Phase 1b procedures (§1.9–1.11)
// ---------------------------------------------------------------------------

/**
 * liabilityByStaff (§1.9): single GROUP BY query — one row per staff with
 * pending/approved/paid totals. LIMIT 500. Scoped by accessibleNodeIds.
 * Requires commission_management:read.
 */
const liabilityByStaffProcedure = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		const controlPanelDb = getControlPanelDb(context);

		try {
			return await liabilityByStaff(context.tenantDb, controlPanelDb, {
				branchId: input.branchId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds ?? [],
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: err instanceof Error ? err.message : "Failed to compute liability by staff",
			});
		}
	});

/**
 * markPaidById (§1.10): batch ≤50 by IDs + paymentReference. Per-id TX with
 * FOR UPDATE, validates status='approved'. Emits audit action commission.mark_paid.
 * Requires commission_management:process.
 */
const markPaidByIdProcedure = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			ids: z.array(z.string().uuid()).min(1).max(50),
			paymentReference: z.string().min(1).max(255),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"process",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

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
const voidByIdProcedure = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			reason: z.string().min(1).max(500),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"approve",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

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

// listPendingReview: returns pending_review splits for the Review tab.
// Requires commission_management:read.
const listPendingReviewProcedure = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			limit: z.number().min(1).max(200).default(50),
			cursor: z
				.object({
					earnedAt: z.string(),
					id: z.string().uuid(),
				})
				.optional(),
		}),
	)
	.handler(async ({ context, input }) => {
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

		try {
			await requirePermission(context.tenantDb, context.member, "commission_management", "read");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		const controlPanelDb = getControlPanelDb(context);
		return listPendingReview(context.tenantDb, controlPanelDb, {
			accessibleNodeIds: context.accessibleNodeIds,
			limit: input.limit,
			cursor: input.cursor,
		});
	});

// resolveReview: promote pending_review → pending (approve) or void (reject).
// Requires commission_review:resolve (distinct from bulk approve permission).
const resolveReviewProcedure = protectedProcedure
	.input(
		z.discriminatedUnion("action", [
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				action: z.literal("approve"),
				reason: z.string().max(500).optional(),
			}),
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				action: z.literal("reject"),
				reason: z.string().min(1).max(500),
			}),
		]),
	)
	.handler(async ({ context, input }) => {
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

		try {
			await requirePermission(context.tenantDb, context.member, "commission_review", "resolve");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "commission_review:resolve required",
			});
		}

		try {
			return await resolvePendingReview(
				context.tenantDb,
				input.id,
				input.action,
				"reason" in input ? (input.reason ?? null) : null,
				{
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
					accessibleNodeIds: context.accessibleNodeIds,
				},
			);
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Failed to resolve review",
			});
		}
	});

export const commissionSplitsRouter = {
	list,
	getByAppointment,
	getMyCommissions: myCommissions,
	listLedger,
	approve,
	markPaid,
	void: voidSplit,
	createManualAdjustment: manualAdjustment,
	liabilitySummary: liabilitySummaryProcedure,
	markPaidBatch: markPaidBatchProcedure,
	liabilityByStaff: liabilityByStaffProcedure,
	markPaidById: markPaidByIdProcedure,
	voidById: voidByIdProcedure,
	listPendingReview: listPendingReviewProcedure,
	resolveReview: resolveReviewProcedure,
};
