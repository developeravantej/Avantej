import { protectedProcedure } from "@avantej-core/api";
import { assertOrgContextMatch } from "@avantej-core/api/guards";
import { user } from "@avantej-core/db/schema/auth";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { ghlPendingContacts } from "@avantej-core/db/schema/tenant/ghl-pending-contacts";
import {
	getDescendantNodeIds,
	requirePermission,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { getBetterAuth } from "@/lib/better-auth";
import { getControlPanelDb } from "@/lib/db";
import { isPlaceholderEmail } from "@/services/gohighlevel.service";
import { getEnvVar } from "./_shared";

/**
 * GHL approval → onboarding hand-off (Stage 1 + Stage 4 of the flow).
 *
 * After a contact is approved (member materialized), staff dispatch a sign-in
 * link so the person can set a password and complete registration. This module
 * owns:
 *   - listApprovedContacts: the durable approved-row lifecycle (Approved →
 *     Link sent → Registered) so the queue survives a reload — the state lives
 *     on ghl_pending_contacts, not in the browser session.
 *   - sendOnboardingLink: dispatch the existing magic-link sign-in email and
 *     stamp onboarding_link_sent_at/by.
 *
 * RBAC mirrors the approval queue: rows are scoped to the reviewer's accessible
 * branches and require user_management:update.
 */

const APPROVED_WINDOW_DAYS = 30;

// The tenant db is typed loosely on the request context, so annotate the
// query projections explicitly to keep row inference from collapsing to `any`.
type ApprovedRow = {
	id: string;
	ghlContactId: string;
	proposedName: string | null;
	proposedEmail: string | null;
	proposedPhone: string | null;
	resolvedBranchNodeId: string | null;
	reviewedAt: Date | null;
	onboardingLinkSentAt: Date | null;
};
type ContactLinkRow = { ghlContactId: string; userId: string };

type ReviewContext = {
	tenantDb: Parameters<typeof getDescendantNodeIds>[0];
	member: { hierarchyScopeId: string };
	accessibleNodeIds?: string[];
};

async function resolveAccessible(context: ReviewContext): Promise<string[]> {
	if (context.accessibleNodeIds?.length) return context.accessibleNodeIds;
	return getDescendantNodeIds(
		context.tenantDb,
		context.member.hierarchyScopeId,
	);
}

export const onboardingHandoffProcedures = {
	/**
	 * Approved rows (last 30 days) within the reviewer's scope, each carrying
	 * the onboarding lifecycle: whether the sign-in link was sent, and whether
	 * the person has finished registration (linked user's role === "user").
	 */
	listApprovedContacts: protectedProcedure
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

			const since = new Date(
				Date.now() - APPROVED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
			);
			const rows = (await context.tenantDb
				.select({
					id: ghlPendingContacts.id,
					ghlContactId: ghlPendingContacts.ghlContactId,
					proposedName: ghlPendingContacts.proposedName,
					proposedEmail: ghlPendingContacts.proposedEmail,
					proposedPhone: ghlPendingContacts.proposedPhone,
					resolvedBranchNodeId: ghlPendingContacts.resolvedBranchNodeId,
					reviewedAt: ghlPendingContacts.reviewedAt,
					onboardingLinkSentAt: ghlPendingContacts.onboardingLinkSentAt,
				})
				.from(ghlPendingContacts)
				.where(
					and(
						eq(ghlPendingContacts.status, "approved"),
						gte(ghlPendingContacts.reviewedAt, since),
						inArray(ghlPendingContacts.resolvedBranchNodeId, accessibleNodeIds),
					),
				)
				.orderBy(desc(ghlPendingContacts.reviewedAt))) as ApprovedRow[];

			if (rows.length === 0) return [];

			// Batch-resolve the linked user for each contact (one query), then the
			// control-panel user rows (one query) — avoids N+1 across two DBs.
			const contactIds = rows.map((r) => r.ghlContactId);
			const links = (await context.tenantDb
				.select({
					ghlContactId: ghlContactLinks.ghlContactId,
					userId: ghlContactLinks.userId,
				})
				.from(ghlContactLinks)
				.where(
					inArray(ghlContactLinks.ghlContactId, contactIds),
				)) as ContactLinkRow[];
			const userIdByContact = new Map(
				links.map((l) => [l.ghlContactId, l.userId]),
			);

			const cpDb = getControlPanelDb(context.honoContext);
			const userIds = [...new Set(links.map((l) => l.userId))];
			const users =
				cpDb && userIds.length
					? await cpDb
							.select({
								id: user.id,
								email: user.email,
								role: user.role,
							})
							.from(user)
							.where(inArray(user.id, userIds))
					: [];
			const userById = new Map(users.map((u) => [u.id, u]));

			return rows.map((r) => {
				const userId = userIdByContact.get(r.ghlContactId) ?? null;
				const linkedUser = userId ? userById.get(userId) : null;
				return {
					id: r.id,
					proposedName: r.proposedName,
					proposedEmail: r.proposedEmail,
					proposedPhone: r.proposedPhone,
					resolvedBranchNodeId: r.resolvedBranchNodeId,
					reviewedAt: r.reviewedAt,
					onboardingLinkSentAt: r.onboardingLinkSentAt,
					hasLinkedUser: !!linkedUser,
					emailIsPlaceholder: linkedUser
						? isPlaceholderEmail(linkedUser.email)
						: true,
					// Registration complete when the linked user's role is set.
					registered: linkedUser?.role === "user",
				};
			});
		}),

	/**
	 * Dispatch the onboarding sign-in link for an approved contact and stamp
	 * onboarding_link_sent_at/by. Rejects rows that aren't approved, aren't in
	 * scope, have no linked user, or whose linked user still has a placeholder
	 * email (staff must add a real address in Customers first).
	 */
	sendOnboardingLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				pendingId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member || !context.honoContext) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant or request context not available",
				});
			}
			assertOrgContextMatch(context, input);
			await requirePermission(
				context.tenantDb,
				context.member,
				"user_management",
				"update",
			);

			const [pending] = await context.tenantDb
				.select()
				.from(ghlPendingContacts)
				.where(eq(ghlPendingContacts.id, input.pendingId))
				.limit(1);
			if (!pending || pending.status !== "approved") {
				throw new ORPCError("NOT_FOUND", {
					message: "Approved contact not found",
				});
			}

			// RBAC: the row's branch must be inside the reviewer's scope.
			const accessibleNodeIds = await resolveAccessible(context);
			if (accessibleNodeIds.length === 0) {
				throw new ORPCError("FORBIDDEN", {
					message: "You have no accessible branches",
				});
			}
			if (
				pending.resolvedBranchNodeId &&
				!accessibleNodeIds.includes(pending.resolvedBranchNodeId)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Contact is outside your accessible branches",
				});
			}

			// Resolve the materialized user via the contact link.
			const [link] = await context.tenantDb
				.select({ userId: ghlContactLinks.userId })
				.from(ghlContactLinks)
				.where(eq(ghlContactLinks.ghlContactId, pending.ghlContactId))
				.limit(1);
			if (!link?.userId) {
				throw new ORPCError("NOT_FOUND", {
					message: "No member is linked to this contact yet",
				});
			}

			const cpDb = getControlPanelDb(context.honoContext);
			if (!cpDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel DB not available",
				});
			}
			const linkedUser = await cpDb.query.user.findFirst({
				where: eq(user.id, link.userId),
			});
			if (!linkedUser) {
				throw new ORPCError("NOT_FOUND", {
					message: "Linked user record not found",
				});
			}
			if (isPlaceholderEmail(linkedUser.email)) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This contact has no real email. Add one from Customers before sending a link.",
				});
			}

			try {
				const auth = getBetterAuth(context.honoContext);
				const frontendURL =
					getEnvVar("CORS_ORIGIN") ||
					getEnvVar("FRONTEND_URL") ||
					"http://localhost:3021";
				// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
				await (auth as any).api.signInMagicLink({
					body: {
						email: linkedUser.email,
						callbackURL: `${frontendURL}/set-password`,
					},
					headers: context.honoContext.req.raw.headers,
				});
			} catch (err) {
				console.error("[ghl.sendOnboardingLink] dispatch failed", err);
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to send the onboarding link. Please try again.",
				});
			}

			const sentAt = new Date();
			await context.tenantDb
				.update(ghlPendingContacts)
				.set({
					onboardingLinkSentAt: sentAt,
					onboardingLinkSentBy: context.session.user.id,
					updatedAt: sentAt,
				})
				.where(eq(ghlPendingContacts.id, pending.id));

			return { success: true, email: linkedUser.email, sentAt };
		}),
};
