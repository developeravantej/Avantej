/**
 * Permission Utility Functions
 * 
 * Centralized utilities for permission checking, role validation,
 * and organization context handling.
 * 
 * TODO: Integrate with Better-Auth permission system
 * Currently uses types from old auth system - needs migration
 */

import type {
  UserWithPermissions,
  RequiredPermission,
  PermissionCheckResult,
  FlattenedPermission,
  RoutePermissionConfig,
  OrganizationData,
  RoleData
} from "@/types/auth";
import { isUserWithPermissions } from "@/types/auth";

/**
 * Flatten user permissions with deduplication (optimized version)
 */
export function flattenUserPermissions(user: UserWithPermissions): FlattenedPermission[] {
  if (!isUserWithPermissions(user)) {
    return [];
  }

  const permissions: FlattenedPermission[] = [];
  const seen = new Set<string>();

  user.organizations.forEach(org => {
    org.roles.forEach(role => {
      role.permissions.forEach(permission => {
        // Flatten each action into a separate permission entry
        permission.actions.forEach(action => {
          const permissionKey = `${permission.resource}:${action}:${permission.scope}:${org.id}:${role.id}`;
          
          // Deduplicate identical permissions
          if (!seen.has(permissionKey)) {
            seen.add(permissionKey);
            permissions.push({
              resource: permission.resource,
              actions: [action], // Single action per flattened permission
              scope: permission.scope,
              field_permissions: permission.field_permissions,
              conditions: permission.conditions,
              organizationId: org.id,
              roleName: role.name,
              roleId: role.id
            });
          }
        });
      });
    });
  });

  return permissions;
}

/**
 * Check if user has a specific permission (optimized with optional permission map)
 */
export function checkUserPermission(
  user: UserWithPermissions | null,
  requiredPermission: RequiredPermission,
  organizationId?: string,
  permissionMap?: Map<string, boolean>
): PermissionCheckResult {
  if (!user || !isUserWithPermissions(user)) {
    return {
      hasPermission: false,
      reason: "User not authenticated"
    };
  }

  // System admins have all permissions
  if (user.is_system_admin) {
    return {
      hasPermission: true,
      reason: "System administrator"
    };
  }

  // Use provided permission map for O(1) lookup if available
  if (permissionMap) {
    const orgId = organizationId || user.current_organization_id;
    const { resource, action, scope } = requiredPermission;

    // Try different lookup patterns for maximum flexibility
    const lookupKeys = [
      // Most specific: resource:action:orgId:scope
      ...(orgId && scope ? [`${resource}:${action}:${orgId}:${scope}`] : []),
      // Organization-scoped: resource:action:orgId
      ...(orgId ? [`${resource}:${action}:${orgId}`] : []),
      // Scope-based: resource:action:scope (for system-wide permissions)
      ...(scope ? [`${resource}:${action}:${scope}`] : []),
      // Global: resource:action (fallback)
      `${resource}:${action}`
    ];

    const hasPermission = lookupKeys.some(key => permissionMap.has(key));
    
    return {
      hasPermission,
      reason: hasPermission 
        ? "Permission granted" 
        : `Missing permission: ${resource}:${action}`
    };
  }

  // Fallback to traditional permission checking
  const userPermissions = flattenUserPermissions(user);
  
  // If organization is specified, filter to that organization
  const relevantPermissions = organizationId 
    ? userPermissions.filter(p => p.organizationId === organizationId)
    : userPermissions;

  const hasPermission = relevantPermissions.some(userPerm => {
    const resourceMatch = userPerm.resource === requiredPermission.resource;
    const actionMatch = userPerm.actions.includes(requiredPermission.action);
    const scopeMatch = requiredPermission.scope 
      ? userPerm.scope === requiredPermission.scope 
      : true;

    return resourceMatch && actionMatch && scopeMatch;
  });

  return {
    hasPermission,
    reason: hasPermission 
      ? "Permission granted" 
      : `Missing permission: ${requiredPermission.resource}:${requiredPermission.action}`
  };
}

/**
 * Check if user has multiple permissions (AND logic)
 */
function checkUserPermissions(
  user: UserWithPermissions | null,
  requiredPermissions: RequiredPermission[],
  organizationId?: string
): PermissionCheckResult {
  if (!user || !isUserWithPermissions(user)) {
    return {
      hasPermission: false,
      reason: "User not authenticated"
    };
  }

  // System admins have all permissions
  if (user.is_system_admin) {
    return {
      hasPermission: true,
      reason: "System administrator"
    };
  }

  for (const permission of requiredPermissions) {
    const result = checkUserPermission(user, permission, organizationId);
    if (!result.hasPermission) {
      return result;
    }
  }

  return {
    hasPermission: true,
    reason: "All permissions granted"
  };
}

/**
 * Check if user has any of the specified permissions (OR logic)
 */
function checkUserHasAnyPermission(
  user: UserWithPermissions | null,
  requiredPermissions: RequiredPermission[],
  organizationId?: string
): PermissionCheckResult {
  if (!user || !isUserWithPermissions(user)) {
    return {
      hasPermission: false,
      reason: "User not authenticated"
    };
  }

  // System admins have all permissions
  if (user.is_system_admin) {
    return {
      hasPermission: true,
      reason: "System administrator"
    };
  }

  for (const permission of requiredPermissions) {
    const result = checkUserPermission(user, permission, organizationId);
    if (result.hasPermission) {
      return result;
    }
  }

  return {
    hasPermission: false,
    reason: "None of the required permissions found"
  };
}

/**
 * Check if user has a specific role
 */
export function checkUserRole(
  user: UserWithPermissions | null,
  roleName: string,
  organizationId?: string
): PermissionCheckResult {
  if (!user || !isUserWithPermissions(user)) {
    return {
      hasPermission: false,
      reason: "User not authenticated"
    };
  }

  const hasRole = user.organizations.some(org => {
    if (organizationId && org.id !== organizationId) {
      return false;
    }
    return org.roles.some(role => role.name === roleName);
  });

  return {
    hasPermission: hasRole,
    reason: hasRole 
      ? `Role ${roleName} found` 
      : `Role ${roleName} not found`
  };
}

/**
 * Check if user has any of the specified roles (OR logic)
 */
function checkUserHasAnyRole(
  user: UserWithPermissions | null,
  roleNames: string[],
  organizationId?: string
): PermissionCheckResult {
  if (!user || !isUserWithPermissions(user)) {
    return {
      hasPermission: false,
      reason: "User not authenticated"
    };
  }

  for (const roleName of roleNames) {
    const result = checkUserRole(user, roleName, organizationId);
    if (result.hasPermission) {
      return result;
    }
  }

  return {
    hasPermission: false,
    reason: "None of the required roles found"
  };
}

/**
 * Get user's organizations
 */
function getUserOrganizations(user: UserWithPermissions | null): OrganizationData[] {
  if (!user || !isUserWithPermissions(user)) {
    return [];
  }
  return user.organizations;
}

/**
 * Get specific organization by ID
 */
function getUserOrganization(
  user: UserWithPermissions | null,
  organizationId: string
): OrganizationData | null {
  if (!user || !isUserWithPermissions(user)) {
    return null;
  }
  return user.organizations.find(org => org.id === organizationId) || null;
}

/**
 * Get user's roles in a specific organization
 */
function getUserRolesInOrganization(
  user: UserWithPermissions | null,
  organizationId: string
): RoleData[] {
  const organization = getUserOrganization(user, organizationId);
  return organization ? organization.roles : [];
}

/**
 * Get user's highest priority role (lowest number = highest priority)
 */
function getUserHighestPriorityRole(
  user: UserWithPermissions | null,
  organizationId?: string
): RoleData | null {
  if (!user || !isUserWithPermissions(user)) {
    return null;
  }

  let allRoles: RoleData[] = [];

  if (organizationId) {
    allRoles = getUserRolesInOrganization(user, organizationId);
  } else {
    allRoles = user.organizations.flatMap(org => org.roles);
  }

  if (allRoles.length === 0) {
    return null;
  }

  return allRoles.reduce((highest, current) => 
    current.priority < highest.priority ? current : highest
  );
}

/**
 * Check route permissions based on configuration
 */
function checkRoutePermissions(
  user: UserWithPermissions | null,
  routeConfig: RoutePermissionConfig,
  organizationId?: string
): PermissionCheckResult {
  if (!user || !isUserWithPermissions(user)) {
    return {
      hasPermission: false,
      reason: "User not authenticated"
    };
  }

  // Check if system admin access is allowed
  if (routeConfig.allowSystemAdmin && user.is_system_admin) {
    return {
      hasPermission: true,
      reason: "System administrator access"
    };
  }

  // Check if organization is required
  if (routeConfig.requiresOrganization && !organizationId) {
    return {
      hasPermission: false,
      reason: "Organization context required"
    };
  }

  // Check required roles
  if (routeConfig.requiredRoles && routeConfig.requiredRoles.length > 0) {
    const roleCheck = checkUserHasAnyRole(user, routeConfig.requiredRoles, organizationId);
    if (!roleCheck.hasPermission) {
      return roleCheck;
    }
  }

  // Check required permissions
  if (routeConfig.requiredPermissions && routeConfig.requiredPermissions.length > 0) {
    const permissionCheck = checkUserPermissions(user, routeConfig.requiredPermissions, organizationId);
    if (!permissionCheck.hasPermission) {
      return permissionCheck;
    }
  }

  return {
    hasPermission: true,
    reason: "Route access granted"
  };
}

/**
 * Create a permission checker function for a specific organization
 */
function createOrganizationPermissionChecker(
  user: UserWithPermissions | null,
  organizationId: string
) {
  return {
    hasPermission: (permission: RequiredPermission) => 
      checkUserPermission(user, permission, organizationId).hasPermission,
    
    hasRole: (roleName: string) => 
      checkUserRole(user, roleName, organizationId).hasPermission,
    
    hasAnyRole: (roleNames: string[]) => 
      checkUserHasAnyRole(user, roleNames, organizationId).hasPermission,
    
    getRoles: () => getUserRolesInOrganization(user, organizationId),
    
    getHighestRole: () => getUserHighestPriorityRole(user, organizationId)
  };
}





