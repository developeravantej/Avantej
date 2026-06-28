import { protectedProcedure } from "@avantej-core/api";
import { assertOrgContextMatch } from "@avantej-core/api/guards";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { ghlPendingContacts } from "@avantej-core/db/schema/tenant/ghl-pending-contacts";
import {
	getDescendantNodeIds,
	requirePermission,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getControlPanelDb } from "@/lib/db";
import {
	approvePendingGhlContact,
	rejectPendingGhlContact,
} from "@/services/gohighlevel.service";

/**
 * GHL inbound approval gate (Phase G follow-up). When an org enables the gate,
 * a brand-new inbound contact is held in `ghl_pending_contacts` rather than
 * being materialized. Staff review it here and approve (→ create the member) or
 * reject (→ discard, audit kept). RBAC: rows are scoped to the reviewer's
 * accessible branches; approve/reject/toggle require `user_management:update`
 * (same gate as the GHL connection config this queue lives under). Every
 * procedure asserts input.organizationId matches the authenticated tenant
 * (cross-tenant spoof guard, Plan C C.2).
 */
export const pendingProcedures = {
	listPendingContacts: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Tenant context required",
				});
			}
			assertOrgContextMatch(context, input);
			const accessibleNodeIds = await resolveAccessible(context);
			if (accessibleNodeIds.length === 0) return [];

			const rows = await context.tenantDb
				.select({
					id: ghlPendingContacts.id,
					ghlContactId: ghlPendingContacts.ghlContactId,
					proposedName: ghlPendingContacts.proposedName,
					proposedEmail: ghlPendingContacts.proposedEmail,
					proposedPhone: ghlPendingContacts.proposedPhone,
					resolvedBranchNodeId: ghlPendingContacts.resolvedBranchNodeId,
					status: ghlPendingContacts.status,
					createdAt: ghlPendingContacts.createdAt,
				})
				.from(ghlPendingContacts)
				.where(
					and(
						eq(ghlPendingContacts.status, "pending"),
						inArray(ghlPendingContacts.resolvedBranchNodeId, accessibleNodeIds),
					),
				)
				.orderBy(desc(ghlPendingContacts.createdAt));
			return rows;
		}),

	approvePendingContact: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				pendingId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Tenant context required",
				});
			}
			assertOrgContextMatch(context, input);
			await requirePermission(
				context.tenantDb,
				context.member,
				"user_management",
				"update",
			);
			const controlPanelDb = getControlPanelDb(context.honoContext);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel DB not available",
				});
			}

			const pending = await loadReviewablePending(context, input.pendingId);

			const result = await approvePendingGhlContact({
				c: context.honoContext,
				controlPanelDb,
				tenantDb: context.tenantDb,
				organizationId: input.organizationId,
				pending,
				reviewedByUserId: context.member.userId,
			});
			if (result.status === "already_reviewed") {
				throw new ORPCError("CONFLICT", {
					message: "Pending contact was already reviewed",
				});
			}
			return result;
		}),

	rejectPendingContact: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				pendingId: z.string().uuid(),
				reason: z.string().trim().max(500).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Tenant context required",
				});
			}
			assertOrgContextMatch(context, input);
			await requirePermission(
				context.tenantDb,
				context.member,
				"user_management",
				"update",
			);

			const pending = await loadReviewablePending(context, input.pendingId);

			const result = await rejectPendingGhlContact({
				tenantDb: context.tenantDb,
				pending,
				reviewedByUserId: context.member.userId,
				reason: input.reason ?? null,
			});
			if (result.status === "already_reviewed") {
				throw new ORPCError("CONFLICT", {
					message: "Pending contact was already reviewed",
				});
			}
			return result;
		}),

	// Toggle the gate for an org (admin config — same permission as connecting).
	setApprovalGate: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				enabled: z.boolean(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "Tenant context required",
				});
			}
			assertOrgContextMatch(context, input);
			await requirePermission(
				context.tenantDb,
				context.member,
				"user_management",
				"update",
			);
			const controlPanelDb = getControlPanelDb(context.honoContext);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel DB not available",
				});
			}
			await controlPanelDb
				.update(organizations)
				.set({ ghlRequireApproval: input.enabled, updatedAt: new Date() })
				.where(eq(organizations.id, input.organizationId));
			return { status: "ok" as const, enabled: input.enabled };
		}),
};

type ReviewContext = {
	tenantDb: Parameters<typeof getDescendantNodeIds>[0];
	member: { hierarchyScopeId: string };
	accessibleNodeIds?: string[];
};

/**
 * Load a pending row, asserting it exists, is still pending, and falls inside
 * the reviewer's accessible branches. The atomic claim in the service layer is
 * the real race guard; this is the fast-path + RBAC check before mutating.
 */
async function loadReviewablePending(
	context: ReviewContext,
	pendingId: string,
): Promise<typeof ghlPendingContacts.$inferSelect> {
	const [pending] = await context.tenantDb
		.select()
		.from(ghlPendingContacts)
		.where(eq(ghlPendingContacts.id, pendingId))
		.limit(1);
	if (!pending || pending.status !== "pending") {
		throw new ORPCError("NOT_FOUND", {
			message: "Pending contact not found or already reviewed",
		});
	}
	await assertBranchReviewable(pending.resolvedBranchNodeId, context);
	return pending;
}

/**
 * Resolve the reviewer's accessible branch ids — the context value when present
 * (set by orpc-tenant.middleware), else a descendant walk from the member's
 * hierarchy scope (mirrors guards.resolveAccessibleNodeIds). For an org-root
 * admin this returns every node.
 */
async function resolveAccessible(context: ReviewContext): Promise<string[]> {
	if (context.accessibleNodeIds?.length) return context.accessibleNodeIds;
	return getDescendantNodeIds(
		context.tenantDb,
		context.member.hierarchyScopeId,
	);
}

/**
 * Throw FORBIDDEN if the pending row's branch is outside the reviewer's scope.
 * A state-changing review with NO accessible branches is always rejected — the
 * empty-scope case must fail closed (unlike read-only branch guards).
 */
async function assertBranchReviewable(
	branchNodeId: string | null,
	context: ReviewContext,
): Promise<void> {
	const scope = await resolveAccessible(context);
	if (scope.length === 0) {
		throw new ORPCError("FORBIDDEN", {
			message: "You have no accessible branches to review contacts",
		});
	}
	if (branchNodeId && !scope.includes(branchNodeId)) {
		throw new ORPCError("FORBIDDEN", {
			message: "Pending contact is outside your accessible branches",
		});
	}
}
