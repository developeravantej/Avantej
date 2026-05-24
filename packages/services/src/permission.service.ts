/**
 * Permission Service
 *
 * Provides permission checking utilities for RBAC using database tables.
 * Checks permissions via roles -> role_permissions -> permissions tables.
 *
 * Usage:
 * ```typescript
 * import { hasPermission, requirePermission } from "@avantej-core/services";
 *
 * if (!await hasPermission(tenantDb, member, "hierarchy_management", "create")) {
 *   throw new Error("Permission denied");
 * }
 * ```
 */

import type { members } from "@avantej-core/db/schema/tenant/members";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type Member = typeof members.$inferSelect;

export type Resource =
	// Organizational & access control
	| "hierarchy_management"
	| "user_management"
	| "role_management"
	// Services & appointments
	// (canonical `*_management` form only — bare nouns `users`, `roles`, `branches`,
	//  `services`, `appointments` were removed in the pre-launch hardening pass)
	| "service_management"
	| "appointment_management"
	| "class_slot_management"
	// Sales & payments
	| "sales"
	| "payments"
	| "package_management"
	| "promotion_management"
	| "tax_configuration"
	// Inventory & purchasing
	| "inventory"
	| "purchase_order_management"
	| "stock_requests"
	| "transfer_orders"
	// Finance & HR
	| "expense_management"
	| "commission_management"
	| "trainer_tier_management"
	| "category_commission_management"
	| "commission_payout"
	| "commission_review"
	// Communication
	| "announcement_management"
	// Customers
	| "customer_management"
	| "walk_in_customer_management"
	// Reporting
	| "reports"
	// Audit log
	| "audit_log"
	// Attendance (tracking-pages P7)
	| "attendance_management"
	// Point of Sale (tracking-pages P4)
	| "pos"
	// Refunds Ledger (tracking-pages P5)
	| "refund_management";
export type Action =
	| "create"
	| "read"
	| "update"
	| "delete"
	| "approve"
	| "reject"
	| "resolve"
	| "process"
	| "export"
	| "import";

/**
 * Check if member has a specific permission
 *
 * Implementation:
 * - Checks member's role in roles table
 * - Admin role (priority >= 100): All permissions granted
 * - Other roles: Checks role_permissions table for specific permission
 *
 * @param tenantDb - Tenant database client
 * @param member - Member record from tenant database
 * @param resource - Resource name (e.g., "hierarchy_management")
 * @param action - Action name (e.g., "create")
 * @returns true if member has permission, false otherwise
 */
export async function hasPermission(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	member: Member,
	resource: Resource,
	action: Action,
): Promise<boolean> {
	// Wave 3a Agent 2.1 (Journey J1): when member has a custom roleId set, resolve
	// permissions via that role's role_permissions joins. Falls through to the
	// legacy text-role path if roleId is null OR the referenced role no longer exists.
	let role = member.roleId
		? await tenantDb.query.roles.findFirst({
			where: (roles, { eq }) => eq(roles.id, member.roleId as string),
		})
		: undefined;

	if (!role) {
		// Fast-path / fallback: look up role by legacy text name.
		role = await tenantDb.query.roles.findFirst({
			where: (roles, { eq }) => eq(roles.name, member.role),
		});
	}

	if (!role) {
		// Role not found in RBAC tables - fallback to simple check
		return member.role === "admin";
	}

	// Admin role has all permissions (check priority)
	if (role.priority >= 100) {
		return true;
	}

	// Check if role has the specific permission
	const permission = await tenantDb.query.permissions.findFirst({
		where: (permissions, { eq, and }) =>
			and(eq(permissions.resource, resource), eq(permissions.action, action)),
	});

	if (!permission) {
		// Permission not found in RBAC tables
		return false;
	}

	const rolePerm = await tenantDb.query.rolePermissions.findFirst({
		where: (rolePermissions, { eq, and }) =>
			and(
				eq(rolePermissions.roleId, role.id),
				eq(rolePermissions.permissionId, permission.id),
			),
	});

	return !!rolePerm;
}

/**
 * Check if member has hierarchy management permission
 *
 * Convenience function for checking hierarchy_management permissions.
 *
 * @param tenantDb - Tenant database client
 * @param member - Member record from tenant database
 * @param action - Action to check (default: "create")
 * @returns true if member has permission, false otherwise
 */
export async function checkHierarchyPermission(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	member: Member,
	action: Action = "create",
): Promise<boolean> {
	return hasPermission(tenantDb, member, "hierarchy_management", action);
}

/**
 * Require permission or throw error
 *
 * Throws an error if member doesn't have the required permission.
 *
 * @param tenantDb - Tenant database client
 * @param member - Member record from tenant database
 * @param resource - Resource name
 * @param action - Action name
 * @throws Error if permission is denied
 */
export class PermissionDeniedError extends Error {
	constructor(
		public readonly resource: Resource,
		public readonly action: Action,
		public readonly role: string,
	) {
		super(
			`Permission denied: ${role} role does not have ${resource}:${action} permission`,
		);
		this.name = "PermissionDeniedError";
	}
}

export async function requirePermission(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	member: Member,
	resource: Resource,
	action: Action,
): Promise<void> {
	const hasPerm = await hasPermission(tenantDb, member, resource, action);
	if (!hasPerm) {
		throw new PermissionDeniedError(resource, action, member.role);
	}
}
