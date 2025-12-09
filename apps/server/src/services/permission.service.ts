/**
 * Permission Service
 *
 * Provides permission checking utilities for RBAC.
 * Currently implements simple role-based checks (admin = all permissions).
 * Can be enhanced later with full RBAC table-based permissions.
 *
 * Usage:
 * ```typescript
 * import { hasPermission, checkHierarchyPermission } from "@/services/permission.service";
 *
 * if (!hasPermission(member, "hierarchy_management", "create")) {
 *   throw new Error("Permission denied");
 * }
 * ```
 */

import { members } from "@avantej-core/db/schema/tenant/members";

type Member = typeof members.$inferSelect;

export type Resource =
  | "hierarchy_management"
  | "user_management"
  | "service_management"
  | "appointment_management";
export type Action = "create" | "read" | "update" | "delete";

/**
 * Check if member has a specific permission
 *
 * Current implementation:
 * - Admin role: All permissions granted
 * - Other roles: No permissions (can be enhanced with RBAC table)
 *
 * @param member - Member record from tenant database
 * @param resource - Resource name (e.g., "hierarchy_management")
 * @param action - Action name (e.g., "create")
 * @returns true if member has permission, false otherwise
 */
export function hasPermission(
  member: Member,
  resource: Resource,
  action: Action
): boolean {
  // Admin role has all permissions
  if (member.role === "admin") {
    return true;
  }

  // TODO: Implement RBAC table-based permission checks
  // For now, only admin has permissions
  return false;
}

/**
 * Check if member has hierarchy management permission
 *
 * Convenience function for checking hierarchy_management permissions.
 *
 * @param member - Member record from tenant database
 * @param action - Action to check (default: "create")
 * @returns true if member has permission, false otherwise
 */
export function checkHierarchyPermission(
  member: Member,
  _action: Action = "create"
): boolean {
  return hasPermission(member, "hierarchy_management", _action);
}

/**
 * Require permission or throw error
 *
 * Throws an error if member doesn't have the required permission.
 *
 * @param member - Member record from tenant database
 * @param resource - Resource name
 * @param action - Action name
 * @throws Error if permission is denied
 */
export function requirePermission(
  member: Member,
  resource: Resource,
  action: Action
): void {
  if (!hasPermission(member, resource, action)) {
    throw new Error(
      `Permission denied: ${member.role} role does not have ${resource}:${action} permission`
    );
  }
}
