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
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { fireCustomerSync } from "@/services/ghl/customer-sync-trigger";

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
			if (context.organizationId) {
				await fireCustomerSync({
					honoContext: context.honoContext,
					tenantDb: context.tenantDb,
					organizationId: context.organizationId,
					userId,
					customerProfile: updated,
					operation: "update",
				});
			}

			return updated;
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

			if (context.organizationId) {
				await fireCustomerSync({
					honoContext: context.honoContext,
					tenantDb: context.tenantDb,
					organizationId: context.organizationId,
					userId: input.targetUserId,
					customerProfile: updated,
					operation: "update",
				});
			}

			return updated;
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

			if (context.organizationId) {
				await fireCustomerSync({
					honoContext: context.honoContext,
					tenantDb: context.tenantDb,
					organizationId: context.organizationId,
					userId: input.targetUserId,
					customerProfile: updated,
					operation: "delete",
				});
			}

			return { ok: true, profileId: updated.id };
		}),
};
