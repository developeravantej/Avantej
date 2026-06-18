import { protectedProcedure } from "@avantej-core/api";
import { requirePermission } from "@avantej-core/services";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { fireCustomerSync } from "@/services/ghl/customer-sync-trigger";

export const profileLifecycleProcedures = {
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
};
