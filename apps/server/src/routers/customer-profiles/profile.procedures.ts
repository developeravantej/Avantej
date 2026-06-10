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
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { fireCustomerSync } from "@/services/ghl/customer-sync-trigger";
import { getBetterAuth } from "@/lib/better-auth";
import { getEnvVar } from "./_shared";

export const profileProcedures = {
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
