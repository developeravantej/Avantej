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
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { fireCustomerSync } from "@/services/ghl/customer-sync-trigger";
import { getBetterAuth } from "@/lib/better-auth";
import { isPlaceholderEmail } from "@/services/gohighlevel.service";

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
				// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
				await (auth as any).api.signInMagicLink({
					body: { email: input.email },
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
				// biome-ignore lint/suspicious/noExplicitAny: better-auth api typing is dynamic
				await (auth as any).api.signInMagicLink({
					body: { email: linkedUser.email },
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
};
