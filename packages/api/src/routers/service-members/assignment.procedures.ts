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
import { memberServiceBufferOverrides } from "@avantej-core/db/schema/tenant/member-service-buffer-overrides";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";

export const serviceMembersAssignmentProcedures = {
	/**
	 * Admin: assign a member to a service.
	 * Requires user_management:update or service_management:update.
	 */
	assign: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
				serviceId: z.string().uuid(),
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

			await context.tenantDb
				.insert(serviceMembers)
				.values({
					memberId: input.memberId,
					serviceId: input.serviceId,
					isPrimary: false,
				})
				.onConflictDoNothing();

			return { success: true };
		}),

	/**
	 * Admin: remove a member from a service, also clearing any buffer override.
	 * Requires user_management:update or service_management:update.
	 */
	remove: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
				serviceId: z.string().uuid(),
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

			// Clear any buffer override first (no FK cascade across these tables)
			await context.tenantDb
				.delete(memberServiceBufferOverrides)
				.where(
					and(
						eq(memberServiceBufferOverrides.memberId, input.memberId),
						eq(memberServiceBufferOverrides.serviceId, input.serviceId),
					),
				);

			await context.tenantDb
				.delete(serviceMembers)
				.where(
					and(
						eq(serviceMembers.memberId, input.memberId),
						eq(serviceMembers.serviceId, input.serviceId),
					),
				);

			return { success: true };
		}),

	/**
	 * List all members assigned to a specific service, with their profile info.
	 * Requires user_management:read, service_management:read, or appointment_management:read.
	 */
	listForService: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				serviceId: z.string().uuid(),
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
				"appointment_management",
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
						"Requires user_management, service_management, or appointment_management read permission.",
				});
			}

			const rows = await context.tenantDb
				.select({
					memberId: serviceMembers.memberId,
					isPrimary: serviceMembers.isPrimary,
					displayName: memberProfiles.displayName,
				})
				.from(serviceMembers)
				.leftJoin(
					memberProfiles,
					eq(memberProfiles.memberId, serviceMembers.memberId),
				)
				.where(eq(serviceMembers.serviceId, input.serviceId));

			return rows.map(
				(r: {
					memberId: string;
					isPrimary: boolean;
					displayName: string | null;
				}) => ({
					memberId: r.memberId,
					isPrimary: r.isPrimary,
					displayName: r.displayName ?? r.memberId,
				}),
			);
		}),
};
