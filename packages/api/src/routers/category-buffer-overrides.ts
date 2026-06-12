import {
	listCategoryBufferOverridesForMember,
	upsertCategoryBufferOverride,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import { eq, and } from "drizzle-orm";
import { serviceMembers } from "@avantej-core/db/schema/tenant/service-members";
import { services } from "@avantej-core/db/schema/tenant/services";

async function requireUserOrServiceManagementRead(
	tenantDb: Parameters<typeof requirePermissionOrpc>[0],
	member: Parameters<typeof requirePermissionOrpc>[1],
): Promise<void> {
	for (const resource of ["user_management", "service_management"] as const) {
		try {
			await requirePermissionOrpc(tenantDb, member, resource, "read");
			return;
		} catch {
			/* try next */
		}
	}
	throw new ORPCError("FORBIDDEN", {
		message: "Requires user_management or service_management read permission.",
	});
}

async function requireUserOrServiceManagementUpdate(
	tenantDb: Parameters<typeof requirePermissionOrpc>[0],
	member: Parameters<typeof requirePermissionOrpc>[1],
): Promise<void> {
	for (const resource of ["user_management", "service_management"] as const) {
		try {
			await requirePermissionOrpc(tenantDb, member, resource, "update");
			return;
		} catch {
			/* try next */
		}
	}
	throw new ORPCError("FORBIDDEN", {
		message:
			"Requires user_management or service_management update permission.",
	});
}

export const categoryBufferOverridesRouter = {
	listForMember: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requireUserOrServiceManagementRead(
				context.tenantDb,
				context.member,
			);
			return listCategoryBufferOverridesForMember(
				context.tenantDb,
				input.memberId,
			);
		}),

	upsert: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
				categoryId: z.string().uuid(),
				bufferTimeMinutes: z.number().int().min(0).max(480).nullable(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requireUserOrServiceManagementUpdate(
				context.tenantDb,
				context.member,
			);
			return upsertCategoryBufferOverride(
				context.tenantDb,
				input.memberId,
				input.categoryId,
				input.bufferTimeMinutes,
			);
		}),

	listMine: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context }) => {
			return listCategoryBufferOverridesForMember(
				context.tenantDb,
				context.member.id,
			);
		}),

	updateMine: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				categoryId: z.string().uuid(),
				bufferTimeMinutes: z.number().int().min(0).max(480).nullable(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
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
