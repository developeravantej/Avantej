import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
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
import { getControlPanelDb } from "../../lib/context-helpers";

// ---------------------------------------------------------------------------
// Existing procedures (unchanged)
// ---------------------------------------------------------------------------

// listPendingReview: returns pending_review splits for the Review tab.
// Requires commission_management:read.
const listPendingReviewProcedure = tenantProcedure
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
		
		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_management", "read")

		const controlPanelDb = getControlPanelDb(context);
		return listPendingReview(context.tenantDb, controlPanelDb, {
			accessibleNodeIds: context.accessibleNodeIds,
			limit: input.limit,
			cursor: input.cursor,
		});
	});

// resolveReview: promote pending_review → pending (approve) or void (reject).
// Requires commission_review:resolve (distinct from bulk approve permission).
const resolveReviewProcedure = tenantProcedure
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
		
		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_review", "resolve")

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

export const commissionSplitsReviewProcedures = {
	listPendingReview: listPendingReviewProcedure,
	resolveReview: resolveReviewProcedure,
};
