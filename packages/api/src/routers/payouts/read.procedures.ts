/**
 * Payouts Router
 *
 * API endpoint for listing payouts with recipient enrichment from control panel.
 */

import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { payoutBatches } from "@avantej-core/db/schema/tenant/payout-batches";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import {
	eq,
	and,
	desc,
	inArray,
	isNull,
	isNotNull,
	or,
	type SQL,
} from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
	resolveAccessibleNodeIds,
} from "../../guards";
import { resolveScopeNodeIds } from "@avantej-core/services";
import { recipientSummary } from "@avantej-core/services/payouts.service";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export const payoutsReadProcedures = {
	/**
	 * List payouts with optional filters and recipient name enrichment
	 */
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				status: z
					.enum(["pending", "processing", "paid", "failed", "canceled"])
					.optional(),
				recipientId: z.string().optional(),
				// Optional hierarchy scope. May be ANY hierarchy level (country/
				// region/state/branch). When supplied, narrows results to that
				// node's accessible SUBTREE; when omitted, behavior is unchanged
				// (non-admins keep their full nodes; admins stay org-wide).
				branchId: z.string().uuid().optional(),
				limit: z.number().int().min(1).max(200).default(50),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"commission_payout",
				"read",
			);

			// Resolve the RBAC ceiling once. Prefer context.accessibleNodeIds, but
			// fall back to the member's hierarchy subtree when it is empty
			// (defense-in-depth: a degraded empty context must not skip the
			// FORBIDDEN guard or silently widen the non-admin filter below). When
			// context.accessibleNodeIds is non-empty this returns it verbatim, so
			// behavior is byte-for-byte unchanged.
			const accessibleNodeIds = await resolveAccessibleNodeIds(context);

			// Subtree scope (Phase 0.5): an out-of-scope branchId is rejected
			// here, ahead of any query. guardBranchAccessible no-ops on
			// undefined, so the no-scope path is unaffected.
			guardBranchAccessible(input.branchId, accessibleNodeIds);
			// When a branchId is supplied, expand it to its accessible SUBTREE.
			// With NO branchId, scopeIds is exactly accessibleNodeIds, so
			// the non-admin filter below is byte-for-byte unchanged and admins
			// stay org-wide.
			const scopeIds = input.branchId
				? await resolveScopeNodeIds(
						context.tenantDb,
						input.branchId,
						accessibleNodeIds,
					)
				: accessibleNodeIds;

			// Build filter conditions
			const conditions: SQL[] = [];

			if (input.status) {
				conditions.push(eq(payouts.status, input.status));
			}
			if (input.recipientId) {
				conditions.push(eq(payouts.recipientId, input.recipientId));
			}
			if (context.member?.role !== "admin" && accessibleNodeIds.length) {
				// RBAC for non-admin callers ONLY. Admins bypass via role check —
				// although `createContext` populates `accessibleNodeIds` for admins
				// too (descendant nodes of their hierarchyScopeId), an admin should
				// see every payout in the tenant regardless of branch anchor.
				//
				// CP-009: a non-admin sees a row when EITHER
				//   (a) they ARE the recipient (own payouts always visible), OR
				//   (b) the payout is appointment-linked AND the appointment's branchId
				//       is within their accessible hierarchy nodes, OR
				//   (c) the payout is batch-linked (no appointmentId) AND the batch's
				//       branchId is within their accessible hierarchy nodes.
				// Batch payouts that have NEITHER an appointment NOR a scoped batch
				// (batchId IS NULL or batch.branchId IS NULL) are NOT visible to
				// non-admins unless they are the recipient — this prevents org-wide
				// batch payout leakage to branch-scoped staff.
				const callerUserId =
					context.member?.userId ?? context.session?.user?.id;

				// Arm (b): appointment-linked payout, scoped by appointment.branchId
				const appointmentBranchPredicate = and(
					isNotNull(payouts.appointmentId),
					inArray(appointments.branchId, scopeIds),
				);

				// Arm (c): batch payout (no appointmentId), scoped by payoutBatches.branchId
				const batchBranchPredicate = and(
					isNull(payouts.appointmentId),
					isNotNull(payouts.batchId),
					inArray(payoutBatches.branchId, scopeIds),
				);

				const branchScopePredicate = or(
					appointmentBranchPredicate,
					batchBranchPredicate,
				);

				const rbacPredicate = callerUserId
					? or(eq(payouts.recipientId, callerUserId), branchScopePredicate)
					: branchScopePredicate;
				conditions.push(rbacPredicate as SQL);
			}

			// ADMIN narrowing: admins skip the non-admin branch filter above
			// (org-wide by design). But when an explicit branchId is picked, narrow
			// them to that subtree too — keep a payout when its appointment OR its
			// batch falls inside the chosen scope. No branchId → admins stay org-wide.
			if (
				context.member?.role === "admin" &&
				input.branchId &&
				scopeIds.length > 0
			) {
				conditions.push(
					or(
						inArray(appointments.branchId, scopeIds),
						inArray(payoutBatches.branchId, scopeIds),
					) as SQL,
				);
			}

			const payoutRows = await context.tenantDb
				.select({ payout: payouts })
				.from(payouts)
				.leftJoin(appointments, eq(payouts.appointmentId, appointments.id))
				.leftJoin(payoutBatches, eq(payouts.batchId, payoutBatches.id))
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
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

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
	 * Lifetime stats for a single payout recipient.
	 *
	 * Admin: any recipientId.
	 * Non-admin: recipientId's member must have hierarchyScopeId ∈ accessibleNodeIds.
	 *
	 * Perm: payouts:read
	 */
	recipientSummary: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				recipientId: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"commission_payout",
				"read",
			);

			// Non-admin: verify the recipient is within the caller's accessible nodes
			if (
				context.member.role !== "admin" &&
				context.accessibleNodeIds?.length
			) {
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
};
