import {
	listCategoryBufferOverridesForMember,
	upsertCategoryBufferOverride,
	requirePermission,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { eq, and } from "drizzle-orm";
import { serviceMembers } from "@avantej-core/db/schema/tenant/service-members";
import { services } from "@avantej-core/db/schema/tenant/services";

export const categoryBufferOverridesRouter = {
	listForMember: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) throw new ORPCError("FORBIDDEN");

			let hasPermission = false;
			for (const resource of ["user_management", "service_management"] as const) {
				try {
					await requirePermission(context.tenantDb, context.member, resource, "read");
					hasPermission = true;
					break;
				} catch {
					/* try next */
				}
			}
			if (!hasPermission)
				throw new ORPCError("FORBIDDEN", {
					message: "Requires user_management or service_management read permission.",
				});

			return listCategoryBufferOverridesForMember(context.tenantDb, input.memberId);
		}),

	upsert: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
				categoryId: z.string().uuid(),
				bufferTimeMinutes: z.number().int().min(0).max(480).nullable(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) throw new ORPCError("FORBIDDEN");

			let hasPermission = false;
			for (const resource of ["user_management", "service_management"] as const) {
				try {
					await requirePermission(context.tenantDb, context.member, resource, "update");
					hasPermission = true;
					break;
				} catch {
					/* try next */
				}
			}
			if (!hasPermission)
				throw new ORPCError("FORBIDDEN", {
					message: "Requires user_management or service_management update permission.",
				});

			return upsertCategoryBufferOverride(
				context.tenantDb,
				input.memberId,
				input.categoryId,
				input.bufferTimeMinutes,
			);
		}),

	listMine: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context }) => {
			if (!context.tenantDb || !context.member) throw new ORPCError("FORBIDDEN");
			return listCategoryBufferOverridesForMember(context.tenantDb, context.member.id);
		}),

	updateMine: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				categoryId: z.string().uuid(),
				bufferTimeMinutes: z.number().int().min(0).max(480).nullable(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.member) throw new ORPCError("FORBIDDEN");

			// Verify the category has assigned services for this member
			const hasAssignment = await context.tenantDb
				.select({ id: serviceMembers.id })
				.from(serviceMembers)
				.innerJoin(services, eq(serviceMembers.serviceId, services.id))
				.where(
					and(
						eq(serviceMembers.memberId, context.member.id),
						eq(services.categoryId, input.categoryId),
					),
				)
				.limit(1);

			if (hasAssignment.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "You have no services in this category.",
				});
			}

			return upsertCategoryBufferOverride(
				context.tenantDb,
				context.member.id,
				input.categoryId,
				input.bufferTimeMinutes,
			);
		}),
};
