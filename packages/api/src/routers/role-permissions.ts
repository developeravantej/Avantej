/**
 * Role Permissions Router
 *
 * API endpoints for managing the many-to-many relationship between roles and permissions.
 * Allows listing, adding, and removing permission assignments for roles.
 */

import { rolePermissions } from "@avantej-core/db/schema/tenant/role-permissions";
import { roles } from "@avantej-core/db/schema/tenant/roles";
import { permissions } from "@avantej-core/db/schema/tenant/permissions";
import { eq, and } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
export const rolePermissionsRouter = {
	/**
	 * List role-permission assignments with permission details
	 *
	 * Optionally filtered by roleId.
	 */
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				roleId: z.string().uuid().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "read")

			const query = context.tenantDb
				.select({
					id: rolePermissions.id,
					roleId: rolePermissions.roleId,
					permissionId: rolePermissions.permissionId,
					scope: rolePermissions.scope,
					resource: permissions.resource,
					action: permissions.action,
					createdAt: rolePermissions.createdAt,
				})
				.from(rolePermissions)
				.innerJoin(
					permissions,
					eq(rolePermissions.permissionId, permissions.id)
				);

			if (input.roleId) {
				return query.where(eq(rolePermissions.roleId, input.roleId));
			}

			return query;
		}),

	/**
	 * Add a permission to a role
	 *
	 * Validates that the role and permission exist. Rejects duplicates.
	 */
	add: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				roleId: z.string().uuid(),
				permissionId: z.string().uuid(),
				scope: z.enum(["organization", "team", "own", "branch"]).optional().default("organization"),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "update")

			// Validate role exists
			const role = await context.tenantDb.query.roles.findFirst({
				where: eq(roles.id, input.roleId),
			});
			if (!role) {
				throw new ORPCError("NOT_FOUND", {
					message: `Role not found: ${input.roleId}`,
				});
			}

			// Validate permission exists
			const permission =
				await context.tenantDb.query.permissions.findFirst({
					where: eq(permissions.id, input.permissionId),
				});
			if (!permission) {
				throw new ORPCError("NOT_FOUND", {
					message: `Permission not found: ${input.permissionId}`,
				});
			}

			try {
				const [created] = await context.tenantDb
					.insert(rolePermissions)
					.values({
						roleId: input.roleId,
						permissionId: input.permissionId,
						scope: input.scope,
					})
					.returning();

				return created;
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("unique")
				) {
					throw new ORPCError("CONFLICT", {
						message:
							"This permission is already assigned to the role",
					});
				}
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to add role permission",
				});
			}
		}),

	/**
	 * Remove a permission from a role
	 *
	 * Cannot modify permissions on system roles.
	 */
	remove: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				roleId: z.string().uuid(),
				permissionId: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "update")

			// Validate role exists and is not system
			const role = await context.tenantDb.query.roles.findFirst({
				where: eq(roles.id, input.roleId),
			});
			if (!role) {
				throw new ORPCError("NOT_FOUND", {
					message: `Role not found: ${input.roleId}`,
				});
			}
			if (role.isSystem) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot modify permissions on system roles",
				});
			}

			await context.tenantDb
				.delete(rolePermissions)
				.where(
					and(
						eq(rolePermissions.roleId, input.roleId),
						eq(rolePermissions.permissionId, input.permissionId)
					)
				);

			return { success: true, message: "Permission removed from role" };
		}),
};
