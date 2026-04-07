/**
 * RBAC Seed Data
 * 
 * Seeds default roles, permissions, and role-permission mappings for a tenant database.
 * Called automatically when a new tenant database is created.
 * 
 * Usage:
 * ```typescript
 * import { seedRBACData } from "@avantej-core/db/seed-rbac";
 * 
 * await seedRBACData(tenantDb);
 * ```
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "./schema/tenant-schema";
import { roles, permissions, rolePermissions } from "./schema/tenant";

/**
 * Seed RBAC data (roles, permissions, role-permission mappings)
 * 
 * Creates default system roles and permissions, then maps permissions to roles.
 * Idempotent - can be called multiple times safely.
 * 
 * @param tenantDb - Drizzle client for tenant database
 */
export async function seedRBACData(
	tenantDb: NeonDatabase<typeof tenantSchema>
): Promise<void> {
	// Default roles
	const defaultRoles = [
		{
			name: "admin",
			priority: 100,
			isSystem: true,
			description: "Full organization access",
		},
		{
			name: "trainer",
			priority: 50,
			isSystem: true,
			description: "Service provider role",
		},
		{
			name: "staff",
			priority: 30,
			isSystem: true,
			description: "Support/reception role",
		},
		{
			name: "client",
			priority: 10,
			isSystem: true,
			description: "End user role",
		},
	];

	// Default permissions
	const defaultPermissions = [
		{ resource: "hierarchy_management", action: "create" },
		{ resource: "hierarchy_management", action: "read" },
		{ resource: "hierarchy_management", action: "update" },
		{ resource: "hierarchy_management", action: "delete" },
		{ resource: "user_management", action: "create" },
		{ resource: "user_management", action: "read" },
		{ resource: "user_management", action: "update" },
		{ resource: "user_management", action: "delete" },
		{ resource: "service_management", action: "create" },
		{ resource: "service_management", action: "read" },
		{ resource: "service_management", action: "update" },
		{ resource: "service_management", action: "delete" },
		{ resource: "appointment_management", action: "create" },
		{ resource: "appointment_management", action: "read" },
		{ resource: "appointment_management", action: "update" },
		{ resource: "appointment_management", action: "delete" },
	];

	// Insert roles (skip if exists)
	const roleMap = new Map<string, string>(); // name -> id
	for (const roleData of defaultRoles) {
		const existing = await tenantDb.query.roles.findFirst({
			where: (roles, { eq }) => eq(roles.name, roleData.name),
		});

		if (!existing) {
			const [role] = await tenantDb
				.insert(roles)
				.values(roleData)
				.returning();
			if (role) roleMap.set(role.name, role.id);
		} else {
			roleMap.set(existing.name, existing.id);
		}
	}

	// Insert permissions (skip if exists)
	const permissionMap = new Map<string, string>(); // "resource:action" -> id
	for (const permData of defaultPermissions) {
		const key = `${permData.resource}:${permData.action}`;
		const existing = await tenantDb.query.permissions.findFirst({
			where: (permissions, { eq, and }) =>
				and(
					eq(permissions.resource, permData.resource),
					eq(permissions.action, permData.action)
				),
		});

		if (!existing) {
			const [perm] = await tenantDb
				.insert(permissions)
				.values(permData)
				.returning();
			if (perm) permissionMap.set(key, perm.id);
		} else {
			permissionMap.set(key, existing.id);
		}
	}

	// Map roles to permissions
	const rolePermissionMappings: Record<string, string[]> = {
		admin: ["*"], // All permissions
		trainer: [
			"hierarchy_management:read",
			"user_management:read",
			"service_management:read",
			"appointment_management:create",
			"appointment_management:read",
			"appointment_management:update",
		],
		staff: [
			"hierarchy_management:read",
			"user_management:read",
			"service_management:read",
			"appointment_management:read",
		],
		client: [
			"service_management:read", // Browse services, categories, and packages
			"service_management:create", // Purchase packages (create package instances)
			"appointment_management:read", // Only own appointments
		],
	};

	// Insert role-permission mappings
	for (const [roleName, permKeys] of Object.entries(rolePermissionMappings)) {
		const roleId = roleMap.get(roleName);
		if (!roleId) continue;

		// Admin gets all permissions
		if (permKeys.includes("*")) {
			for (const permId of permissionMap.values()) {
				await tenantDb
					.insert(rolePermissions)
					.values({
						roleId,
						permissionId: permId,
					})
					.onConflictDoNothing();
			}
		} else {
			for (const key of permKeys) {
				const permId = permissionMap.get(key);
				if (permId) {
					await tenantDb
						.insert(rolePermissions)
						.values({
							roleId,
							permissionId: permId,
						})
						.onConflictDoNothing();
				}
			}
		}
	}
}


