import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import {
	listPendingReview,
	resolvePendingReview,
} from "@avantej-core/services/commission-splits.service";
import { hasPermission } from "@avantej-core/services";
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
//
// F-COM-05 (best-guess product decision): authorize via EITHER
// `commission_review:resolve` OR `commission_payout:create`.
// Rationale: manual adjustments are created by `createManualAdjustment`, which is
// gated on `commission_payout:create`. An operator entitled to create adjustments
// frequently lacks the distinct `commission_review:resolve` permission, which
// blocked the self-serve flow (create → resolve). Accepting either permission lets
// an authorized payout operator resolve the adjustments they are entitled to,
// without weakening the guard to "no permission required". Members holding only
// `commission_review:resolve` (dedicated reviewers) are unaffected.
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

		// F-COM-05: accept EITHER commission_review:resolve OR commission_payout:create.
		const canResolve = await hasPermission(
			context.tenantDb,
			context.member,
			"commission_review",
			"resolve",
		);
		if (!canResolve) {
			// Fall back to the payout-operator permission; throws FORBIDDEN if neither held.
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"commission_payout",
				"create",
			);
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

export const commissionSplitsReviewProcedures = {
	listPendingReview: listPendingReviewProcedure,
	resolveReview: resolveReviewProcedure,
};
