/**
 * Service Members Router — Buffer Time by Service
 *
 * Manages trainer/staff buffer time overrides at the individual service level.
 * Overrides are stored in member_service_buffer_overrides (memberId, serviceId).
 *
 * Resolution cascade:
 *   1. Staff service-level override (most specific)
 *   2. Category default (service_category_config.bufferTimeMinutes)
 *   3. 0 (no buffer)
 *
 * Staff self-service: listMine + updateMyBuffer
 * Admin management:   listForMember + updateBuffer
 */

import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { serviceMembers } from "@avantej-core/db/schema/tenant/service-members";
import { services } from "@avantej-core/db/schema/tenant/services";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import { serviceCategoryConfig } from "@avantej-core/db/schema/tenant/service-category-config";
import { memberServiceBufferOverrides } from "@avantej-core/db/schema/tenant/member-service-buffer-overrides";

export const serviceMembersBufferProcedures = {
	/**
	 * List the services a staff member is assigned to, with their buffer overrides.
	 * No permission gate — scoped to the calling member.
	 */
	listMine: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context }) => {
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN");
			}

			// Get all services this member is assigned to, with category info and default buffer
			const serviceRows = await context.tenantDb
				.select({
					serviceId: services.id,
					serviceName: services.name,
					categoryId: services.categoryId,
					categoryName: serviceCategories.name,
					categoryDefaultBuffer: serviceCategoryConfig.bufferTimeMinutes,
				})
				.from(serviceMembers)
				.innerJoin(services, eq(serviceMembers.serviceId, services.id))
				.leftJoin(
					serviceCategories,
					eq(services.categoryId, serviceCategories.id),
				)
				.leftJoin(
					serviceCategoryConfig,
					eq(services.categoryId, serviceCategoryConfig.categoryId),
				)
				.where(eq(serviceMembers.memberId, context.member.id));

			// Get all service-level overrides for this member
			const overrides = await context.tenantDb
				.select()
				.from(memberServiceBufferOverrides)
				.where(eq(memberServiceBufferOverrides.memberId, context.member.id));

			const overrideMap = new Map(
				overrides.map((o: any) => [o.serviceId, o.bufferTimeMinutes]),
			);

			return serviceRows.map((r: any) => ({
				serviceId: r.serviceId,
				serviceName: r.serviceName,
				categoryId: r.categoryId ?? null,
				categoryName: r.categoryName ?? null,
				categoryDefaultBuffer: r.categoryDefaultBuffer ?? 0,
				bufferTimeMinutes: overrideMap.get(r.serviceId) ?? null,
			}));
		}),

	/**
	 * Staff member sets or clears their own buffer override for a specific service.
	 * bufferTimeMinutes: number → upsert override
	 * bufferTimeMinutes: null  → delete override (revert to category default)
	 */
	updateMyBuffer: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				serviceId: z.string().uuid(),
				bufferTimeMinutes: z.number().int().min(0).max(480).nullable(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN");
			}

			// Verify the member is assigned to this service
			const assignment = await context.tenantDb
				.select({ id: serviceMembers.id })
				.from(serviceMembers)
				.where(
					and(
						eq(serviceMembers.memberId, context.member.id),
						eq(serviceMembers.serviceId, input.serviceId),
					),
				)
				.limit(1);

			if (assignment.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "You are not assigned to this service.",
				});
			}

			if (input.bufferTimeMinutes === null) {
				// Clear override
				await context.tenantDb
					.delete(memberServiceBufferOverrides)
					.where(
						and(
							eq(memberServiceBufferOverrides.memberId, context.member.id),
							eq(memberServiceBufferOverrides.serviceId, input.serviceId),
						),
					);
				return { serviceId: input.serviceId, bufferTimeMinutes: null };
			}

			// Upsert override
			const [result] = await context.tenantDb
				.insert(memberServiceBufferOverrides)
				.values({
					memberId: context.member.id,
					serviceId: input.serviceId,
					bufferTimeMinutes: input.bufferTimeMinutes,
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: [
						memberServiceBufferOverrides.memberId,
						memberServiceBufferOverrides.serviceId,
					],
					set: {
						bufferTimeMinutes: input.bufferTimeMinutes,
						updatedAt: new Date(),
					},
				})
				.returning();

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			return {
				serviceId: input.serviceId,
				bufferTimeMinutes: result!.bufferTimeMinutes,
			};
		}),

	/**
	 * Admin: list the services a specific member is assigned to, with their
	 * buffer overrides. Requires user_management:read or service_management:read.
	 */
	listForMember: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN");
			}

			let hasPermission = false;
			for (const resource of [
				"user_management",
				"service_management",
			] as const) {
				try {
					await requirePermissionOrpc(
						context.tenantDb,
						context.member,
						resource,
						"read",
					);
					hasPermission = true;
					break;
				} catch {
					/* try next */
				}
			}
			if (!hasPermission) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Requires user_management or service_management read permission.",
				});
			}

			const serviceRows = await context.tenantDb
				.select({
					serviceId: services.id,
					serviceName: services.name,
					categoryId: services.categoryId,
					categoryName: serviceCategories.name,
					categoryDefaultBuffer: serviceCategoryConfig.bufferTimeMinutes,
				})
				.from(serviceMembers)
				.innerJoin(services, eq(serviceMembers.serviceId, services.id))
				.leftJoin(
					serviceCategories,
					eq(services.categoryId, serviceCategories.id),
				)
				.leftJoin(
					serviceCategoryConfig,
					eq(services.categoryId, serviceCategoryConfig.categoryId),
				)
				.where(eq(serviceMembers.memberId, input.memberId));

			const overrides = await context.tenantDb
				.select()
				.from(memberServiceBufferOverrides)
				.where(eq(memberServiceBufferOverrides.memberId, input.memberId));

			const overrideMap = new Map(
				overrides.map((o: any) => [o.serviceId, o.bufferTimeMinutes]),
			);

			return serviceRows.map((r: any) => ({
				serviceId: r.serviceId,
				serviceName: r.serviceName,
				categoryId: r.categoryId ?? null,
				categoryName: r.categoryName ?? null,
				categoryDefaultBuffer: r.categoryDefaultBuffer ?? 0,
				bufferTimeMinutes: overrideMap.get(r.serviceId) ?? null,
			}));
		}),

	/**
	 * Admin: set or clear a member's buffer override for a specific service.
	 * bufferTimeMinutes: number → upsert override; null → clear (revert to default).
	 * Requires user_management:update or service_management:update.
	 */
	updateBuffer: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
				serviceId: z.string().uuid(),
				bufferTimeMinutes: z.number().int().min(0).max(480).nullable(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (!context.tenantDb || !context.member) {
				throw new ORPCError("FORBIDDEN");
			}

			let hasPermission = false;
			for (const resource of [
				"user_management",
				"service_management",
			] as const) {
				try {
					await requirePermissionOrpc(
						context.tenantDb,
						context.member,
						resource,
						"update",
					);
					hasPermission = true;
					break;
				} catch {
					/* try next */
				}
			}
			if (!hasPermission) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Requires user_management or service_management update permission.",
				});
			}

			// Verify the target member is assigned to this service
			const assignment = await context.tenantDb
				.select({ id: serviceMembers.id })
				.from(serviceMembers)
				.where(
					and(
						eq(serviceMembers.memberId, input.memberId),
						eq(serviceMembers.serviceId, input.serviceId),
					),
				)
				.limit(1);

			if (assignment.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "This member is not assigned to this service.",
				});
			}

			if (input.bufferTimeMinutes === null) {
				await context.tenantDb
					.delete(memberServiceBufferOverrides)
					.where(
						and(
							eq(memberServiceBufferOverrides.memberId, input.memberId),
							eq(memberServiceBufferOverrides.serviceId, input.serviceId),
						),
					);
				return { serviceId: input.serviceId, bufferTimeMinutes: null };
			}

			const [result] = await context.tenantDb
				.insert(memberServiceBufferOverrides)
				.values({
					memberId: input.memberId,
					serviceId: input.serviceId,
					bufferTimeMinutes: input.bufferTimeMinutes,
					updatedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: [
						memberServiceBufferOverrides.memberId,
						memberServiceBufferOverrides.serviceId,
					],
					set: {
						bufferTimeMinutes: input.bufferTimeMinutes,
						updatedAt: new Date(),
					},
				})
				.returning();

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			return {
				serviceId: input.serviceId,
				bufferTimeMinutes: result!.bufferTimeMinutes,
			};
		}),
};
