import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	propagateCustomerNameForward,
	requirePermission,
	writeAudit,
} from "@avantej-core/services";
import { user } from "@avantej-core/db/schema/auth";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getBetterAuth } from "@/lib/better-auth";
import { getEnvVar } from "./_shared";

export const profileIdentityProcedures = {
	/**
	 * Change the display name on a customer's control-panel user account.
	 * Requires customer_management:update permission.
	 */
	updateName: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
				newName: z.string().min(1, "Name cannot be empty").max(120),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available.",
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

			// RBAC scope: the target must be a member within this tenant AND within
			// the caller's accessible hierarchy (admins bypass). The tenant-DB lookup
			// also prevents cross-tenant mutation — a foreign userId has no member row.
			const targetMember = await context.tenantDb.query.members.findFirst({
				where: eq(members.userId, input.targetUserId),
				columns: { id: true, hierarchyScopeId: true },
			});
			if (!targetMember) {
				throw new ORPCError("NOT_FOUND", {
					message: "Target customer not found",
				});
			}
			if (
				context.member.role !== "admin" &&
				!(context.accessibleNodeIds ?? []).includes(
					targetMember.hierarchyScopeId,
				)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Customer is outside your accessible scope",
				});
			}

			const cpDb = getControlPanelDb(context);

			const existingUser = await cpDb.query.user.findFirst({
				where: eq(user.id, input.targetUserId),
			});
			if (!existingUser) {
				throw new ORPCError("NOT_FOUND", {
					message: "Linked user record not found",
				});
			}

			const trimmed = input.newName.trim();
			if (existingUser.name === trimmed) {
				return { ok: true, name: existingUser.name };
			}

			await cpDb
				.update(user)
				.set({ name: trimmed, updatedAt: new Date() })
				.where(eq(user.id, existingUser.id));

			// Audit log (targetMember already resolved + scope-checked above)
			if (targetMember && context.member) {
				await writeAudit(context.tenantDb!, {
					actorUserId: context.member.userId,
					actorMemberId: context.member.id,
					actorRole: context.member.role ?? undefined,
					action: "customer.name_updated",
					entityType: "member",
					entityId: targetMember.id,
					branchId: targetMember.hierarchyScopeId ?? undefined,
					summary: `Updated name to "${trimmed}"`,
				}).catch(() => {});
			}

			// Propagate-forward: refresh the denormalized customer_name snapshot on
			// FORWARD-FACING records only (upcoming/recurring appointments, current
			// packages). Past sessions, expired/cancelled packages, and all sales
			// orders stay frozen. Best-effort: a failure never fails the rename — the
			// daily refresh cron heals any miss.
			await propagateCustomerNameForward(
				context.tenantDb!,
				input.targetUserId,
				trimmed,
			).catch(() => {});

			return { ok: true, name: trimmed };
		}),

	/**
	 * Change the email address on a customer's control-panel user account.
	 * Requires customer_management:update permission. Rejects if the new email
	 * is already in use by a different user.
	 */
	updateEmail: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
				newEmail: z.string().email("Invalid email address"),
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

			// RBAC scope: target must be a member in this tenant within the caller's
			// accessible hierarchy (admins bypass). Tenant-DB lookup also blocks
			// cross-tenant mutation of the shared control-panel user record.
			const targetMember = await context.tenantDb.query.members.findFirst({
				where: eq(members.userId, input.targetUserId),
				columns: { id: true, hierarchyScopeId: true },
			});
			if (!targetMember) {
				throw new ORPCError("NOT_FOUND", {
					message: "Target customer not found",
				});
			}
			if (
				context.member.role !== "admin" &&
				!(context.accessibleNodeIds ?? []).includes(
					targetMember.hierarchyScopeId,
				)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Customer is outside your accessible scope",
				});
			}

			const cpDb = getControlPanelDb(context);

			const existingUser = await cpDb.query.user.findFirst({
				where: eq(user.id, input.targetUserId),
			});
			if (!existingUser) {
				throw new ORPCError("NOT_FOUND", {
					message: "Linked user record not found",
				});
			}

			const normalised = input.newEmail.toLowerCase().trim();

			if (existingUser.email?.toLowerCase() === normalised) {
				return { ok: true, email: existingUser.email };
			}

			const collision = await cpDb.query.user.findFirst({
				where: eq(user.email, normalised),
			});
			if (collision && collision.id !== existingUser.id) {
				throw new ORPCError("CONFLICT", {
					message: "Email already in use by another account",
				});
			}

			// Has the customer already claimed (i.e. is this a live login email)?
			// Use the authoritative signal — emailVerified is set true by Better-Auth
			// when the magic-link claim is used — rather than the customer_profiles
			// is_unclaimed flag, which is no longer cleared at link-dispatch time.
			const isClaimed = existingUser.emailVerified === true;

			// Changing the email always resets verification (the new address is
			// unproven). For an UNCLAIMED profile that's harmless — the claim/magic
			// link will verify it on first sign-in. For a CLAIMED customer, leaving
			// emailVerified=false would lock them out (requireEmailVerification=true),
			// so we dispatch a verification link to the NEW address below.
			await cpDb
				.update(user)
				.set({ email: normalised, emailVerified: false, updatedAt: new Date() })
				.where(eq(user.id, existingUser.id));

			let verificationSent = false;
			if (isClaimed && context.honoContext) {
				try {
					const auth = getBetterAuth(context.honoContext);
					const frontendURL =
						getEnvVar("CORS_ORIGIN") ||
						getEnvVar("FRONTEND_URL") ||
						"http://localhost:3021";
					// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
					await (auth as any).api.sendVerificationEmail({
						body: {
							email: normalised,
							callbackURL: `${frontendURL}/dashboard`,
						},
						headers: context.honoContext.req.raw.headers,
					});
					verificationSent = true;
				} catch (err) {
					// Don't fail the email change if dispatch fails — staff can resend.
					console.error(
						"[customerProfiles.updateEmail] verification dispatch failed",
						err,
					);
				}
			}

			// Audit log (targetMember already resolved + scope-checked above)
			if (targetMember && context.member) {
				await writeAudit(context.tenantDb!, {
					actorUserId: context.member.userId,
					actorMemberId: context.member.id,
					actorRole: context.member.role ?? undefined,
					action: "customer.email_updated",
					entityType: "member",
					entityId: targetMember.id,
					branchId: targetMember.hierarchyScopeId ?? undefined,
					summary: `Updated email to "${normalised}"`,
				}).catch(() => {});
			}

			return { ok: true, email: normalised, verificationSent };
		}),
};
