import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { requirePermission } from "@avantej-core/services";
import { user } from "@avantej-core/db/schema/auth";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getBetterAuth } from "@/lib/better-auth";
import { getEnvVar } from "./_shared";

const UNCLAIMED_EMAIL_DOMAIN = "avantej.placeholder";

export const claimUnclaimedProcedures = {
	/**
	 * Quick Add — staff creates a full customer profile without the customer
	 * having an account yet. Creates a placeholder control-panel user so the
	 * profile appears in the directory immediately with an "Unclaimed" badge.
	 * Staff can later call sendClaimLink to let the customer take ownership.
	 */
	createUnclaimed: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				firstName: z.string().min(1),
				lastName: z.string().min(1),
				phone: z.string().min(1),
				hierarchyScopeId: z.string().uuid(),
				dateOfBirth: z.string().optional(),
				notes: z.string().optional(),
				// CU-007: optional real email from Quick Add form; if omitted a placeholder is generated
				email: z.string().email().optional(),
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

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"user_management",
					"create",
				);
			} catch (err) {
				throw new ORPCError("FORBIDDEN", {
					message: err instanceof Error ? err.message : "Permission denied",
				});
			}

			// Validate hierarchy scope access (admins bypass)
			if (context.member.role !== "admin") {
				const accessibleNodeIds = context.accessibleNodeIds ?? [];
				if (!accessibleNodeIds.includes(input.hierarchyScopeId)) {
					throw new ORPCError("FORBIDDEN", {
						message: "Hierarchy scope is outside your accessible nodes",
					});
				}
			}

			const cpDb = getControlPanelDb(context);

			// CU-006: Phone dedup — if an active profile already uses this phone, return it
			// instead of creating a duplicate. Idempotent behaviour is preferred for Quick Add
			// UX: double-submitting the same form (network retry, accidental re-click) must
			// not produce two profiles for the same person.
			const existingByPhone =
				await context.tenantDb.query.customerProfiles.findFirst({
					where: and(
						eq(customerProfiles.phone, input.phone.trim()),
						eq(customerProfiles.isDeleted, false),
					),
				});
			if (existingByPhone) {
				// Return the existing profile's key fields so the caller can navigate to it.
				// The member record pre-exists; look it up for a consistent response shape.
				const existingMember = existingByPhone.userId
					? await context.tenantDb.query.members.findFirst({
							where: eq(members.userId, existingByPhone.userId),
						})
					: undefined;
				return {
					memberId: existingMember?.id ?? "",
					profileId: existingByPhone.id,
					userId: existingByPhone.userId ?? "",
				};
			}

			// CU-007: Email dedup — if a real email is supplied, ensure it is not already
			// taken by another control-panel user before we proceed.
			if (input.email) {
				const emailConflict = await cpDb.query.user.findFirst({
					where: eq(user.email, input.email),
				});
				if (emailConflict) {
					throw new ORPCError("CONFLICT", {
						message: "A user with this email address already exists",
					});
				}
			}

			// CU-007: Use the supplied email if provided; otherwise generate a placeholder
			const resolvedEmail = input.email
				? input.email
				: `unclaimed-${crypto.randomUUID()}@${UNCLAIMED_EMAIL_DOMAIN}`;
			const userId = crypto.randomUUID();
			const now = new Date();

			// Step 1 — Insert placeholder/real user into control panel (no password / account row)
			await cpDb.insert(user).values({
				id: userId,
				name: `${input.firstName} ${input.lastName}`.trim(),
				firstName: input.firstName,
				lastName: input.lastName,
				email: resolvedEmail,
				emailVerified: false,
				phone: input.phone ?? null,
				createdAt: now,
				updatedAt: now,
			});

			// Step 2 — Dual-write: organizationMembers (CP) + members (tenant)
			// CU-005: If this or step 3 fails, roll back the CP user to avoid orphans.
			const membershipService = new MembershipService(cpDb);
			let tenantMemberId: string | undefined;
			try {
				await membershipService.createMember({
					userId,
					organizationId: input.organizationId,
					role: "client",
					hierarchyScopeId: input.hierarchyScopeId,
					tenantDb: context.tenantDb,
				});
				// Capture the created tenant member id for potential cleanup
				const createdMember = await context.tenantDb.query.members.findFirst({
					where: eq(members.userId, userId),
				});
				tenantMemberId = createdMember?.id;
			} catch (memberErr) {
				// Step 2 failed — clean up the CP user inserted in step 1
				try {
					await cpDb.delete(user).where(eq(user.id, userId));
				} catch {
					// best-effort cleanup; log but don't mask the original error
					console.error(
						"[createUnclaimed] CP user cleanup failed after membershipService error",
						userId,
					);
				}
				throw memberErr;
			}

			// Step 3 — Create customer profile flagged as unclaimed
			let profile: { id: string } | undefined;
			try {
				const [inserted] = await context.tenantDb
					.insert(customerProfiles)
					.values({
						userId,
						phone: input.phone,
						isUnclaimed: true,
						dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
						notes: input.notes ?? null,
					})
					.returning({ id: customerProfiles.id });
				profile = inserted;
			} catch (profileErr) {
				// Step 3 failed — clean up tenant member (step 2) and CP user (step 1)
				if (tenantMemberId) {
					try {
						await context.tenantDb
							.delete(members)
							.where(eq(members.id, tenantMemberId));
					} catch {
						console.error(
							"[createUnclaimed] tenant member cleanup failed after profile insert error",
							tenantMemberId,
						);
					}
				}
				try {
					await cpDb.delete(user).where(eq(user.id, userId));
				} catch {
					console.error(
						"[createUnclaimed] CP user cleanup failed after profile insert error",
						userId,
					);
				}
				throw profileErr;
			}

			if (!profile) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to create customer profile",
				});
			}

			const newMember = await context.tenantDb.query.members.findFirst({
				where: eq(members.userId, userId),
			});

			return {
				memberId: newMember?.id ?? "",
				profileId: profile.id,
				userId,
			};
		}),

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
