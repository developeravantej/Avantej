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
import { permissions, rolePermissions, roles } from "./schema/tenant";
import type * as tenantSchema from "./schema/tenant-schema";

/**
 * Seed RBAC data (roles, permissions, role-permission mappings)
 *
 * Creates default system roles and permissions, then maps permissions to roles.
 * Idempotent - can be called multiple times safely.
 *
 * @param tenantDb - Drizzle client for tenant database
 */
export async function seedRBACData(
	tenantDb: NeonDatabase<typeof tenantSchema>,
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
		// Customer directory (tracking-pages P1)
		{ resource: "customer_management", action: "read" },
		{ resource: "customer_management", action: "update" },
		// Walk-in customer management (prior phase — admin grant was missing)
		{ resource: "walk_in_customer_management", action: "create" },
		{ resource: "walk_in_customer_management", action: "read" },
		{ resource: "walk_in_customer_management", action: "update" },
		{ resource: "walk_in_customer_management", action: "delete" },
		// Audit log (tracking-pages P3)
		{ resource: "audit_log", action: "read" },
		// Attendance management (tracking-pages P7)
		{ resource: "attendance_management", action: "read" },
		{ resource: "attendance_management", action: "create" },
		{ resource: "attendance_management", action: "delete" },
		// POS / Record Sale (tracking-pages P4)
		// pos:create is the orchestrator gate — grants access to the recordSale endpoint.
		// sales:create and payments:create are the underlying resource permissions.
		// All three added here (canonical seed) so admin gets them via the "*" mapping.
		{ resource: "pos", action: "create" },
		{ resource: "sales", action: "create" },
		{ resource: "payments", action: "create" },
		// Refunds Ledger (tracking-pages P5)
		{ resource: "refund_management", action: "read" },
		{ resource: "refund_management", action: "create" },
		{ resource: "refund_management", action: "approve" },
		{ resource: "refund_management", action: "process" },
		// Commissions Ledger (tracking-pages P6)
		// commission_management was in the Resource union but had no seeded actions.
		// These four actions are now seeded here (canonical) so admin gets them via "*".
		{ resource: "commission_management", action: "read" },
		{ resource: "commission_management", action: "update" },
		{ resource: "commission_management", action: "approve" },
		{ resource: "commission_management", action: "process" },
		// Trainer tier management
		{ resource: "trainer_tier_management", action: "read" },
		{ resource: "trainer_tier_management", action: "create" },
		{ resource: "trainer_tier_management", action: "update" },
		{ resource: "trainer_tier_management", action: "delete" },
		// Category commission management
		{ resource: "category_commission_management", action: "read" },
		{ resource: "category_commission_management", action: "create" },
		{ resource: "category_commission_management", action: "update" },
		{ resource: "category_commission_management", action: "delete" },
		// Commission payout (finance-gated — granted to admin; restrict to owner-level in prod)
		{ resource: "commission_payout", action: "read" },
		{ resource: "commission_payout", action: "create" },
		{ resource: "commission_payout", action: "update" },
		// Package management (multi-staff Phase 1 — assign staff to package instances)
		{ resource: "package_management", action: "read" },
		{ resource: "package_management", action: "create" },
		{ resource: "package_management", action: "update" },
		{ resource: "package_management", action: "delete" },
		// Announcement management
		{ resource: "announcement_management", action: "read" },
		{ resource: "announcement_management", action: "write" },
		{ resource: "announcement_management", action: "delete" },
		// Expense management
		{ resource: "expense_management", action: "read" },
		{ resource: "expense_management", action: "write" },
		{ resource: "expense_management", action: "delete" },
	];

	// Insert roles (skip if exists)
	const roleMap = new Map<string, string>(); // name -> id
	for (const roleData of defaultRoles) {
		const existing = await tenantDb.query.roles.findFirst({
			where: (roles, { eq }) => eq(roles.name, roleData.name),
		});

		if (!existing) {
			const [role] = await tenantDb.insert(roles).values(roleData).returning();
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
					eq(permissions.action, permData.action),
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
