import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { requirePermission } from "@avantej-core/services";
import { user } from "@avantej-core/db/schema/auth";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getBetterAuth } from "@/lib/better-auth";
import { getEnvVar } from "./_shared";

const UNCLAIMED_EMAIL_DOMAIN = "avantej.placeholder";

export const claimUnclaimedProcedures = {
	/**
	 * Send a magic-link "claim your account" email to an unclaimed customer.
	 * Updates the placeholder email → real email on the control-panel user,
	 * then dispatches a magic-link sign-in so the customer can log in and
	 * take ownership of the pre-filled profile.
	 */
	sendClaimLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
				email: z.string().email("Invalid email address"),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.honoContext) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or Hono context not available.",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"customer_management",
				"update",
			);

			const profile = await context.tenantDb.query.customerProfiles.findFirst({
				where: eq(customerProfiles.id, input.customerProfileId),
			});
			if (!profile) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer profile not found",
				});
			}
			if (!profile.isUnclaimed) {
				throw new ORPCError("BAD_REQUEST", {
					message: "This customer has already claimed their account.",
				});
			}
			if (!profile.userId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot send claim link for a dependent profile",
				});
			}

			// CU-004: RBAC scope check — admins bypass, staff must have access to the member's node
			if (context.member.role !== "admin") {
				const targetMember = await context.tenantDb.query.members.findFirst({
					where: eq(members.userId, profile.userId),
				});
				if (
					!targetMember ||
					!(context.accessibleNodeIds ?? []).includes(
						targetMember.hierarchyScopeId,
					)
				) {
					throw new ORPCError("FORBIDDEN", {
						message: "Customer is outside your accessible scope",
					});
				}
			}

			const cpDb = getControlPanelDb(context);

			const existingUser = await cpDb.query.user.findFirst({
				where: eq(user.id, profile.userId),
			});
			if (!existingUser) {
				throw new ORPCError("NOT_FOUND", {
					message: "Linked user record not found",
				});
			}
			// Self-heal: if the user already has a real email (isUnclaimed flag got out
			// of sync), dispatch to their existing email and clear the flag — no throw.
			const alreadyHasRealEmail = !existingUser.email?.endsWith(
				`@${UNCLAIMED_EMAIL_DOMAIN}`,
			);
			const dispatchEmail = alreadyHasRealEmail
				? existingUser.email!
				: input.email;

			if (!alreadyHasRealEmail) {
				// Check for email collision with another user before swapping
				const collision = await cpDb.query.user.findFirst({
					where: eq(user.email, input.email),
				});
				if (collision && collision.id !== existingUser.id) {
					throw new ORPCError("CONFLICT", {
						message: "Email already in use by another user",
					});
				}

				// Swap placeholder → real email and mark verified so magic-link works
				await cpDb
					.update(user)
					.set({
						email: input.email,
						emailVerified: true,
						updatedAt: new Date(),
					})
					.where(eq(user.id, existingUser.id));
			}

			// Dispatch magic-link sign-in email BEFORE clearing the unclaimed flag.
			// If dispatch fails we throw without touching isUnclaimed, so staff can retry.
			try {
				const auth = getBetterAuth(context.honoContext);
				const frontendURL =
					getEnvVar("CORS_ORIGIN") ||
					getEnvVar("FRONTEND_URL") ||
					"http://localhost:3021";
				// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
				await (auth as any).api.signInMagicLink({
					body: {
						email: dispatchEmail,
						callbackURL: `${frontendURL}/set-password`,
					},
					headers: context.honoContext.req.raw.headers,
				});
			} catch (err) {
				const detail = err instanceof Error ? err.message : String(err);
				console.error(
					"[customerProfiles.sendClaimLink] magic-link dispatch failed",
					err,
				);
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: `Magic-link dispatch failed: ${detail}`,
				});
			}

			// Note: we intentionally do NOT clear is_unclaimed here. Dispatching a
			// link is not proof the customer claimed — they may never open the email.
			// Claim status is derived downstream from the user's emailVerified flag
			// (set by Better-Auth when the magic link is actually used), so the badge
			// and resend UI stay accurate and a re-send is never falsely rejected.
			return { success: true, email: dispatchEmail };
		}),
};
