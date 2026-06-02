/**
 * Server-side overrides for the customer-profiles router.
 *
 * Wraps the shared upsert / upsertForCustomer procedures with an
 * outbound GHL sync trigger after the DB write commits. Adds a new
 * server-only softDelete procedure that fires GHL DELETE on the
 * Contact while marking customer_profiles.is_deleted=true.
 *
 * Mounted via `apps/server/src/index.ts` which spreads server keys
 * over `baseRouter.customerProfiles` (last spread wins).
 */

import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	propagateCustomerNameForward,
	requirePermission,
	upsertCustomerProfile,
	writeAudit,
} from "@avantej-core/services";
import { user } from "@avantej-core/db/schema/auth";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { fireCustomerSync } from "@/services/ghl/customer-sync-trigger";
import { getBetterAuth } from "@/lib/better-auth";
import { isPlaceholderEmail } from "@/services/gohighlevel.service";

const UNCLAIMED_EMAIL_DOMAIN = "avantej.placeholder";

function getEnvVar(key: string): string | undefined {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const cloudflare = require("cloudflare:workers");
		return cloudflare.env?.[key];
	} catch {
		return process.env[key];
	}
}

export const serverCustomerProfilesRouter = {
	upsert: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				phone: z.string().nullable().optional(),
				dateOfBirth: z.string().datetime().nullable().optional(),
				gender: z.string().nullable().optional(),
				address: z.string().nullable().optional(),
				emergencyContactName: z.string().nullable().optional(),
				emergencyContactPhone: z.string().nullable().optional(),
				medicalNotes: z.string().nullable().optional(),
				fitnessGoals: z.array(z.string()).nullable().optional(),
				creditPoints: z.number().int().min(0).optional(),
				notes: z.string().nullable().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "User session required",
				});
			}

			const updated = await upsertCustomerProfile(context.tenantDb, {
				userId,
				...(input.phone !== undefined && { phone: input.phone }),
				...(input.dateOfBirth !== undefined && {
					dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
				}),
				...(input.gender !== undefined && { gender: input.gender }),
				...(input.address !== undefined && { address: input.address }),
				...(input.emergencyContactName !== undefined && {
					emergencyContactName: input.emergencyContactName,
				}),
				...(input.emergencyContactPhone !== undefined && {
					emergencyContactPhone: input.emergencyContactPhone,
				}),
				...(input.medicalNotes !== undefined && {
					medicalNotes: input.medicalNotes,
				}),
				...(input.fitnessGoals !== undefined && {
					fitnessGoals: input.fitnessGoals,
				}),
				...(input.creditPoints !== undefined && {
					creditPoints: input.creditPoints,
				}),
				...(input.notes !== undefined && { notes: input.notes }),
			});

			// Outbound GHL sync — best-effort, never throws (failure mode B).
			let ghlSync: Awaited<ReturnType<typeof fireCustomerSync>> | undefined;
			if (context.organizationId) {
				ghlSync = await fireCustomerSync({
					honoContext: context.honoContext,
					tenantDb: context.tenantDb,
					organizationId: context.organizationId,
					userId,
					customerProfile: updated,
					operation: "update",
				}).catch((err: unknown) => ({
					status: "error" as const,
					error: err instanceof Error ? err.message : String(err),
				}));
			}

			return { ...updated, ghlSync };
		}),

	upsertForCustomer: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
				// nullable so callers can clear a field (null) vs. leave unchanged (undefined)
				phone: z.string().nullable().optional(),
				dateOfBirth: z.string().nullable().optional(),
				gender: z.string().nullable().optional(),
				address: z.string().nullable().optional(),
				emergencyContactName: z.string().nullable().optional(),
				emergencyContactPhone: z.string().nullable().optional(),
				medicalNotes: z.string().nullable().optional(),
				fitnessGoals: z.array(z.string()).nullable().optional(),
				notes: z.string().nullable().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
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

			const target = await context.tenantDb.query.members.findFirst({
				where: and(
					eq(members.userId, input.targetUserId),
					eq(members.role, "client"),
				),
			});
			if (!target) {
				throw new ORPCError("NOT_FOUND", {
					message: "Target customer not found",
				});
			}

			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(target.hierarchyScopeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Target customer is outside your accessible scope",
				});
			}

			const updated = await upsertCustomerProfile(context.tenantDb, {
				userId: input.targetUserId,
				phone: input.phone,
				dateOfBirth:
					input.dateOfBirth === undefined
						? undefined
						: input.dateOfBirth === null
							? null
							: new Date(input.dateOfBirth),
				gender: input.gender,
				address: input.address,
				emergencyContactName: input.emergencyContactName,
				emergencyContactPhone: input.emergencyContactPhone,
				medicalNotes: input.medicalNotes,
				fitnessGoals: input.fitnessGoals,
				notes: input.notes,
			});

			let ghlSync: Awaited<ReturnType<typeof fireCustomerSync>> | undefined;
			if (context.organizationId) {
				ghlSync = await fireCustomerSync({
					honoContext: context.honoContext,
					tenantDb: context.tenantDb,
					organizationId: context.organizationId,
					userId: input.targetUserId,
					customerProfile: updated,
					operation: "update",
				}).catch((err: unknown) => ({
					status: "error" as const,
					error: err instanceof Error ? err.message : String(err),
				}));
			}

			return { ...updated, ghlSync };
		}),

	/**
	 * Soft-delete a customer (admin-scoped). Marks customer_profiles.is_deleted=true,
	 * deletedSource='avantej', then fires syncCustomerToGhl with operation='delete'.
	 */
	softDelete: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
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
				"delete",
			);

			const target = await context.tenantDb.query.members.findFirst({
				where: and(
					eq(members.userId, input.targetUserId),
					eq(members.role, "client"),
				),
			});
			if (!target) {
				throw new ORPCError("NOT_FOUND", {
					message: "Target customer not found",
				});
			}
			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(target.hierarchyScopeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Target customer is outside your accessible scope",
				});
			}

			// Guard: unclaimed profiles have a placeholder CP user row that would become
			// orphaned if the profile is deleted without first cleaning up the user record.
			// Require staff to resolve the unclaimed state (send/cancel claim) first.
			const existingProfile =
				await context.tenantDb.query.customerProfiles.findFirst({
					where: eq(customerProfiles.userId, input.targetUserId),
				});
			if (existingProfile?.isUnclaimed) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Cannot delete an unclaimed profile. Send the customer their claim link, or contact support to cancel the unclaimed account.",
				});
			}

			// Soft-delete the customer profile
			const now = new Date();
			const [updated] = await context.tenantDb
				.update(customerProfiles)
				.set({
					isDeleted: true,
					deletedAt: now,
					deletedSource: "avantej",
					updatedAt: now,
				})
				.where(eq(customerProfiles.userId, input.targetUserId))
				.returning();

			if (!updated) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer profile not found",
				});
			}

			let ghlSync: Awaited<ReturnType<typeof fireCustomerSync>> | undefined;
			if (context.organizationId) {
				ghlSync = await fireCustomerSync({
					honoContext: context.honoContext,
					tenantDb: context.tenantDb,
					organizationId: context.organizationId,
					userId: input.targetUserId,
					customerProfile: updated,
					operation: "delete",
				}).catch((err: unknown) => ({
					status: "error" as const,
					error: err instanceof Error ? err.message : String(err),
				}));
			}

			return { ok: true, profileId: updated.id, ghlSync };
		}),

	/**
	 * Restore a soft-deleted customer. Flips is_deleted=false and re-fires
	 * syncCustomerToGhl with operation='update' so a fresh GHL contact gets
	 * created (the orchestrator's deleted-link guard ensures a POST, not a
	 * PUT to the already-deleted GHL contact).
	 */
	restore: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
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

			const target = await context.tenantDb.query.members.findFirst({
				where: and(
					eq(members.userId, input.targetUserId),
					eq(members.role, "client"),
				),
			});
			if (!target) {
				throw new ORPCError("NOT_FOUND", {
					message: "Target customer not found",
				});
			}
			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(target.hierarchyScopeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Target customer is outside your accessible scope",
				});
			}

			// Verify the profile exists and is actually deleted before restoring
			const existingProfile =
				await context.tenantDb.query.customerProfiles.findFirst({
					where: eq(customerProfiles.userId, input.targetUserId),
				});
			if (!existingProfile) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer profile not found",
				});
			}
			if (!existingProfile.isDeleted) {
				throw new ORPCError("BAD_REQUEST", { message: "not-deleted" });
			}

			const now = new Date();
			const [updated] = await context.tenantDb
				.update(customerProfiles)
				.set({
					isDeleted: false,
					deletedAt: null,
					deletedSource: null,
					updatedAt: now,
				})
				.where(eq(customerProfiles.userId, input.targetUserId))
				.returning();

			if (!updated) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer profile not found",
				});
			}

			let ghlSync: Awaited<ReturnType<typeof fireCustomerSync>> | undefined;
			if (context.organizationId) {
				ghlSync = await fireCustomerSync({
					honoContext: context.honoContext,
					tenantDb: context.tenantDb,
					organizationId: context.organizationId,
					userId: input.targetUserId,
					customerProfile: updated,
					operation: "update",
				}).catch((err: unknown) => ({
					status: "error" as const,
					error: err instanceof Error ? err.message : String(err),
				}));
			}

			return { ok: true, profileId: updated.id, ghlSync };
		}),

	/**
	 * Manually retry GHL customer sync for a customer profile.
	 *
	 * Mirrors `members.retryGhlSync`. Resolves the customer profile, then
	 * re-fires `fireCustomerSync` with operation='update' (the dispatcher
	 * reconciles existing vs. missing GHL contact via the deleted-link
	 * guard in the orchestrator). Permission-gated by customer_management:update.
	 */
	retryGhlSync: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
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
			// Phase 4: dependent profiles (account_group members) have no user_id
			// and therefore no Avantej login or GHL sync surface.
			if (!profile.userId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot retry GHL sync for a dependent customer profile",
				});
			}

			const target = await context.tenantDb.query.members.findFirst({
				where: and(
					eq(members.userId, profile.userId),
					eq(members.role, "client"),
				),
			});
			if (!target) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer member not found",
				});
			}
			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(target.hierarchyScopeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Target customer is outside your accessible scope",
				});
			}

			const ghlSync = await fireCustomerSync({
				honoContext: context.honoContext,
				tenantDb: context.tenantDb,
				organizationId: input.organizationId,
				userId: profile.userId,
				customerProfile: profile,
				operation: profile.isDeleted ? "delete" : "update",
			}).catch((err: unknown) => ({
				status: "error" as const,
				error: err instanceof Error ? err.message : String(err),
			}));

			return { ghlSync };
		}),

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
