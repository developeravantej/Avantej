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
import { isPlaceholderEmail } from "@/services/gohighlevel.service";
import { getEnvVar } from "./_shared";

export const claimDispatchProcedures = {
	/**
	 * Phase 4 — staff backfill for placeholder-email leads.
	 *
	 * Replaces a `ghl-{contactId}@ghl.placeholder` email with a real address
	 * on the linked control-panel user, flips `emailVerified=true`, and
	 * dispatches a fresh magic-link sign-in email so the customer can log in.
	 *
	 * Safety rails:
	 *   - rejects dependents (customer_profile.user_id IS NULL)
	 *   - rejects profiles whose user already has a non-placeholder email
	 *   - rejects if the target email is already used by another user
	 */
	addEmailAndDispatchMagicLink: protectedProcedure
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
			if (!profile.userId) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This profile is a dependent in an account group; it cannot receive its own sign-in link",
				});
			}

			// CU-002: RBAC scope check — admins bypass, staff must have access to the member's node
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
			if (!isPlaceholderEmail(existingUser.email)) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"User already has a real email. Use 'Resend sign-in link' instead.",
				});
			}

			const collision = await cpDb.query.user.findFirst({
				where: eq(user.email, input.email),
			});
			if (collision && collision.id !== existingUser.id) {
				throw new ORPCError("CONFLICT", {
					message: "Email already in use by another user",
				});
			}

			await cpDb
				.update(user)
				.set({
					email: input.email,
					emailVerified: true,
					updatedAt: new Date(),
				})
				.where(eq(user.id, existingUser.id));

			try {
				const auth = getBetterAuth(context.honoContext);
				const frontendURL =
					getEnvVar("CORS_ORIGIN") ||
					getEnvVar("FRONTEND_URL") ||
					"http://localhost:3021";
				// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
				await (auth as any).api.signInMagicLink({
					body: {
						email: input.email,
						callbackURL: `${frontendURL}/set-password`,
					},
					headers: context.honoContext.req.raw.headers,
				});
			} catch (err) {
				console.error(
					"[customerProfiles.addEmailAndDispatchMagicLink] dispatch failed",
					err,
				);
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Email updated but magic-link dispatch failed",
				});
			}

			return { success: true, email: input.email };
		}),

	/**
	 * Phase 4 — generic magic-link resend for an existing customer.
	 *
	 * Dispatches a fresh sign-in link to the user already linked to the
	 * profile. Rejects placeholder users (staff should call
	 * `addEmailAndDispatchMagicLink` first) and dependents.
	 */
	resendMagicLink: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
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
			if (!profile.userId) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This profile is a dependent in an account group; it cannot receive its own sign-in link",
				});
			}

			// CU-003: RBAC scope check — admins bypass, staff must have access to the member's node
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

			const linkedUser = await cpDb.query.user.findFirst({
				where: eq(user.id, profile.userId),
			});
			if (!linkedUser) {
				throw new ORPCError("NOT_FOUND", {
					message: "Linked user record not found",
				});
			}
			if (isPlaceholderEmail(linkedUser.email)) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"User has a placeholder email. Use 'Add email + send sign-in' first.",
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
				const detail = err instanceof Error ? err.message : String(err);
				console.error(
					"[customerProfiles.resendMagicLink] dispatch failed",
					err,
				);
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: `Magic-link dispatch failed: ${detail}`,
				});
			}

			return { success: true, email: linkedUser.email };
		}),
};
