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
import {
	requirePermission,
	upsertCustomerProfile,
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
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}
			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED", { message: "User session required" });
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
				...(input.medicalNotes !== undefined && { medicalNotes: input.medicalNotes }),
				...(input.fitnessGoals !== undefined && { fitnessGoals: input.fitnessGoals }),
				...(input.creditPoints !== undefined && { creditPoints: input.creditPoints }),
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
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", { message: "Member context required" });
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"customer_management",
				"update",
			);

			const target = await context.tenantDb.query.members.findFirst({
				where: and(eq(members.userId, input.targetUserId), eq(members.role, "client")),
			});
			if (!target) {
				throw new ORPCError("NOT_FOUND", { message: "Target customer not found" });
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
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", { message: "Member context required" });
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"customer_management",
				"delete",
			);

			const target = await context.tenantDb.query.members.findFirst({
				where: and(eq(members.userId, input.targetUserId), eq(members.role, "client")),
			});
			if (!target) {
				throw new ORPCError("NOT_FOUND", { message: "Target customer not found" });
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
			const existingProfile = await context.tenantDb.query.customerProfiles.findFirst({
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
				throw new ORPCError("NOT_FOUND", { message: "Customer profile not found" });
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
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", { message: "Member context required" });
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"customer_management",
				"update",
			);

			const target = await context.tenantDb.query.members.findFirst({
				where: and(eq(members.userId, input.targetUserId), eq(members.role, "client")),
			});
			if (!target) {
				throw new ORPCError("NOT_FOUND", { message: "Target customer not found" });
			}
			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(target.hierarchyScopeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Target customer is outside your accessible scope",
				});
			}

			// Verify the profile exists and is actually deleted before restoring
			const existingProfile = await context.tenantDb.query.customerProfiles.findFirst({
				where: eq(customerProfiles.userId, input.targetUserId),
			});
			if (!existingProfile) {
				throw new ORPCError("NOT_FOUND", { message: "Customer profile not found" });
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
				throw new ORPCError("NOT_FOUND", { message: "Customer profile not found" });
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
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", { message: "Member context required" });
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
				throw new ORPCError("NOT_FOUND", { message: "Customer profile not found" });
			}
			// Phase 4: dependent profiles (account_group members) have no user_id
			// and therefore no Avantej login or GHL sync surface.
			if (!profile.userId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot retry GHL sync for a dependent customer profile",
				});
			}

			const target = await context.tenantDb.query.members.findFirst({
				where: and(eq(members.userId, profile.userId), eq(members.role, "client")),
			});
			if (!target) {
				throw new ORPCError("NOT_FOUND", { message: "Customer member not found" });
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
				throw new ORPCError("UNAUTHORIZED", { message: "Member context required" });
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
				throw new ORPCError("NOT_FOUND", { message: "Customer profile not found" });
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
					!(context.accessibleNodeIds ?? []).includes(targetMember.hierarchyScopeId)
				) {
					throw new ORPCError("FORBIDDEN", {
						message: "Customer is outside your accessible scope",
					});
				}
			}

			const controlPanelDb = context.honoContext.get(
				"controlPanelDb",
			) as Parameters<typeof getBetterAuth>[0] extends never
				? never
				: ReturnType<typeof getBetterAuth> extends never
					? never
					: never;
			// The above is a type-only no-op; we actually fetch via the Hono ctx below.
			const cpDb = context.honoContext.get("controlPanelDb");
			if (!cpDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}
			void controlPanelDb;

			const existingUser = await (cpDb as any).query.user.findFirst({
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

			const collision = await (cpDb as any).query.user.findFirst({
				where: eq(user.email, input.email),
			});
			if (collision && collision.id !== existingUser.id) {
				throw new ORPCError("CONFLICT", {
					message: "Email already in use by another user",
				});
			}

			await (cpDb as any)
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
					getEnvVar("CORS_ORIGIN") || getEnvVar("FRONTEND_URL") || "http://localhost:3021";
				// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
				await (auth as any).api.signInMagicLink({
					body: { email: input.email, callbackURL: `${frontendURL}/dashboard` },
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
				throw new ORPCError("UNAUTHORIZED", { message: "Member context required" });
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
				throw new ORPCError("NOT_FOUND", { message: "Customer profile not found" });
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
					!(context.accessibleNodeIds ?? []).includes(targetMember.hierarchyScopeId)
				) {
					throw new ORPCError("FORBIDDEN", {
						message: "Customer is outside your accessible scope",
					});
				}
			}

			const cpDb = context.honoContext.get("controlPanelDb");
			if (!cpDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			// biome-ignore lint/suspicious/noExplicitAny: tenant/cp db types differ
			const linkedUser = await (cpDb as any).query.user.findFirst({
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
					getEnvVar("CORS_ORIGIN") || getEnvVar("FRONTEND_URL") || "http://localhost:3021";
				// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
				await (auth as any).api.signInMagicLink({
					body: { email: linkedUser.email, callbackURL: `${frontendURL}/dashboard` },
					headers: context.honoContext.req.raw.headers,
				});
			} catch (err) {
				console.error(
					"[customerProfiles.resendMagicLink] dispatch failed",
					err,
				);
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Magic-link dispatch failed",
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
				throw new ORPCError("UNAUTHORIZED", { message: "Member context required" });
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

			const cpDb = context.honoContext.get("controlPanelDb");
			if (!cpDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			// CU-006: Phone dedup — reject if an active profile already uses this phone
			const phoneConflict = await context.tenantDb.query.customerProfiles.findFirst({
				where: and(
					eq(customerProfiles.phone, input.phone),
					eq(customerProfiles.isDeleted, false),
				),
			});
			if (phoneConflict) {
				throw new ORPCError("CONFLICT", {
					message: "A customer profile with this phone number already exists",
				});
			}

			// CU-007: Email dedup — if a real email is supplied, ensure it is not already
			// taken by another control-panel user before we proceed.
			if (input.email) {
				// biome-ignore lint/suspicious/noExplicitAny: cpDb is untyped from Hono context
				const emailConflict = await (cpDb as any).query.user.findFirst({
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
			// biome-ignore lint/suspicious/noExplicitAny: cpDb retrieved from Hono context is untyped
			await (cpDb as any).insert(user).values({
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
			// biome-ignore lint/suspicious/noExplicitAny: cpDb is untyped from Hono context
			const membershipService = new MembershipService(cpDb as any);
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
					// biome-ignore lint/suspicious/noExplicitAny: cpDb is untyped from Hono context
					await (cpDb as any).delete(user).where(eq(user.id, userId));
				} catch {
					// best-effort cleanup; log but don't mask the original error
					console.error("[createUnclaimed] CP user cleanup failed after membershipService error", userId);
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
						await context.tenantDb.delete(members).where(eq(members.id, tenantMemberId));
					} catch {
						console.error("[createUnclaimed] tenant member cleanup failed after profile insert error", tenantMemberId);
					}
				}
				try {
					// biome-ignore lint/suspicious/noExplicitAny: cpDb is untyped from Hono context
					await (cpDb as any).delete(user).where(eq(user.id, userId));
				} catch {
					console.error("[createUnclaimed] CP user cleanup failed after profile insert error", userId);
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
				throw new ORPCError("UNAUTHORIZED", { message: "Member context required" });
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
				throw new ORPCError("NOT_FOUND", { message: "Customer profile not found" });
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
					!(context.accessibleNodeIds ?? []).includes(targetMember.hierarchyScopeId)
				) {
					throw new ORPCError("FORBIDDEN", {
						message: "Customer is outside your accessible scope",
					});
				}
			}

			const cpDb = context.honoContext.get("controlPanelDb");
			if (!cpDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			// biome-ignore lint/suspicious/noExplicitAny: cpDb is untyped from Hono context
			const existingUser = await (cpDb as any).query.user.findFirst({
				where: eq(user.id, profile.userId),
			});
			if (!existingUser) {
				throw new ORPCError("NOT_FOUND", { message: "Linked user record not found" });
			}
			if (!existingUser.email?.endsWith(`@${UNCLAIMED_EMAIL_DOMAIN}`)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "User already has a real email. Use 'Resend sign-in link' instead.",
				});
			}

			// Check for email collision with another user
			// biome-ignore lint/suspicious/noExplicitAny: cpDb is untyped from Hono context
			const collision = await (cpDb as any).query.user.findFirst({
				where: eq(user.email, input.email),
			});
			if (collision && collision.id !== existingUser.id) {
				throw new ORPCError("CONFLICT", {
					message: "Email already in use by another user",
				});
			}

			// Swap placeholder → real email and mark verified so magic-link works
			// biome-ignore lint/suspicious/noExplicitAny: cpDb is untyped from Hono context
			await (cpDb as any)
				.update(user)
				.set({ email: input.email, emailVerified: true, updatedAt: new Date() })
				.where(eq(user.id, existingUser.id));

			// Dispatch magic-link sign-in email BEFORE clearing the unclaimed flag.
			// If dispatch fails we throw without touching isUnclaimed, so the profile
			// stays isUnclaimed=true and staff can retry the full sendClaimLink flow
			// without manual DB recovery.
			try {
				const auth = getBetterAuth(context.honoContext);
				const frontendURL =
					getEnvVar("CORS_ORIGIN") || getEnvVar("FRONTEND_URL") || "http://localhost:3021";
				// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
				await (auth as any).api.signInMagicLink({
					body: { email: input.email, callbackURL: `${frontendURL}/dashboard` },
					headers: context.honoContext.req.raw.headers,
				});
			} catch (err) {
				console.error("[customerProfiles.sendClaimLink] magic-link dispatch failed", err);
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Magic-link dispatch failed; email updated but claim link not sent",
				});
			}

			// Email dispatched successfully — now clear the unclaimed flag.
			await context.tenantDb
				.update(customerProfiles)
				.set({ isUnclaimed: false, updatedAt: new Date() })
				.where(eq(customerProfiles.id, input.customerProfileId));

			return { success: true, email: input.email };
		}),
};
