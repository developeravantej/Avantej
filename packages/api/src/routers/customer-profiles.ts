/**
 * Customer Profiles Router
 *
 * API endpoints for customer profile (get, upsert).
 * - `get` / `upsert`: self-scoped to the session user.
 * - `upsertForCustomer`: admin-scoped, allows managers to edit any client's profile.
 */

import { members } from "@avantej-core/db/schema/tenant/members";
import {
	getCustomerProfile,
	requirePermission,
	upsertCustomerProfile,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const customerProfilesRouter = {
	get: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ context }) => {
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

			const profile = await getCustomerProfile(context.tenantDb, userId);
			return profile;
		}),

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
				phone: input.phone ?? null,
				dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
				gender: input.gender ?? null,
				address: input.address ?? null,
				emergencyContactName: input.emergencyContactName ?? null,
				emergencyContactPhone: input.emergencyContactPhone ?? null,
				medicalNotes: input.medicalNotes ?? null,
				fitnessGoals: input.fitnessGoals ?? null,
				creditPoints: input.creditPoints,
				notes: input.notes ?? null,
			});
			return updated;
		}),

	/**
	 * Admin-scoped profile upsert.
	 *
	 * Allows managers (customer_management:update) to edit any client's profile.
	 * Verifies the target user is a 'client' member within the caller's accessible scope.
	 * Does NOT touch the existing self-scoped `upsert` above.
	 */
	upsertForCustomer: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
				phone: z.string().optional(),
				dateOfBirth: z.string().optional(), // ISO date string, converted to Date in handler
				gender: z.string().optional(),
				address: z.string().optional(),
				emergencyContactName: z.string().optional(),
				emergencyContactPhone: z.string().optional(),
				medicalNotes: z.string().optional(),
				fitnessGoals: z.array(z.string()).optional(),
				notes: z.string().optional(),
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

			// Verify targetUserId is a client member in this tenant
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

			// Row-level RBAC: confirm target is within caller's accessible scope
			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(target.hierarchyScopeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Target customer is outside your accessible scope",
				});
			}

			return upsertCustomerProfile(context.tenantDb, {
				userId: input.targetUserId,
				phone: input.phone,
				dateOfBirth: input.dateOfBirth
					? new Date(input.dateOfBirth)
					: undefined,
				gender: input.gender,
				address: input.address,
				emergencyContactName: input.emergencyContactName,
				emergencyContactPhone: input.emergencyContactPhone,
				medicalNotes: input.medicalNotes,
				fitnessGoals: input.fitnessGoals,
				notes: input.notes,
			});
		}),
};
