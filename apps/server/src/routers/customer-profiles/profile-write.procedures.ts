import { protectedProcedure } from "@avantej-core/api";
import {
	requirePermission,
	upsertCustomerProfile,
} from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { fireCustomerSync } from "@/services/ghl/customer-sync-trigger";

export const profileWriteProcedures = {
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
};
