/**
 * Roles Router
 *
 * API endpoints for managing custom and system roles in tenant organizations.
 * System roles (isSystem = true) cannot be modified or deleted.
 * Custom roles must have priority 1-99 (100 is reserved for admin system role).
 */

import { roles } from "@avantej-core/db/schema/tenant/roles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq, desc } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";

export const rolesRouter = {
	/**
	 * List all roles ordered by priority (highest first)
	 */
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
			})
		)
		.handler(async ({ context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "role_management", "read")

			const items = await context.tenantDb
				.select()
				.from(roles)
				.orderBy(desc(roles.priority));

			return items;
		}),

	/**
	 * Create a new custom role
	 *
	 * Priority must be 1-99 (100 is reserved for admin).
	 * Name must be unique within the organization.
	 */
	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1).max(100),
				description: z.string().max(500).optional(),
				priority: z.number().int().min(1).max(99),
			})
		)
		.handler(async ({ input, context }) => {
			

			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "role_management", "create")

			try {
				const [created] = await context.tenantDb
					.insert(roles)
					.values({
						name: input.name,
						description: input.description ?? null,
						isSystem: false,
						priority: input.priority,
					})
					.returning();

				return created;
			} catch (error) {
				// Handle unique constraint violation on name
				if (
					error instanceof Error &&
					error.message.includes("unique")
				) {
					throw new ORPCError("CONFLICT", {
						message: `A role with name "${input.name}" already exists`,
					});
				}
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to create role",
				});
			}
		}),

	/**
	 * Update a custom role
	 *
	 * Cannot modify system roles.
	 */
	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				name: z.string().min(1).max(100).optional(),
				description: z.string().max(500).optional(),
				priority: z.number().int().min(1).max(99).optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "role_management", "update")

			// Check role exists and is not system
			const existing = await context.tenantDb.query.roles.findFirst({
				where: eq(roles.id, input.id),
			});

			if (!existing) {
				throw new ORPCError("NOT_FOUND", {
					message: `Role not found: ${input.id}`,
				});
			}

			if (existing.isSystem) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot modify system roles",
				});
			}

			try {
				const [updated] = await context.tenantDb
					.update(roles)
					.set({
						...(input.name !== undefined && { name: input.name }),
						...(input.description !== undefined && {
							description: input.description,
						}),
						...(input.priority !== undefined && {
							priority: input.priority,
						}),
						updatedAt: new Date(),
					})
					.where(eq(roles.id, input.id))
					.returning();

				return updated;
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("unique")
				) {
					throw new ORPCError("CONFLICT", {
						message: `A role with name "${input.name}" already exists`,
					});
				}
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to update role",
				});
			}
		}),

	/**
	 * Delete a custom role
	 *
	 * Cannot delete system roles. Role permissions are cascade-deleted.
	 */
	delete: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "role_management", "delete")

			const existing = await context.tenantDb.query.roles.findFirst({
				where: eq(roles.id, input.id),
			});

			if (!existing) {
				throw new ORPCError("NOT_FOUND", {
					message: `Role not found: ${input.id}`,
				});
			}

			if (existing.isSystem) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot delete system roles",
				});
			}

			// Clear roleId on any members that had this role before deleting
			await context.tenantDb
				.update(members)
				.set({ roleId: null })
				.where(eq(members.roleId, input.id));

			await context.tenantDb.delete(roles).where(eq(roles.id, input.id));

			return { success: true, message: "Role deleted successfully" };
		}),
};
