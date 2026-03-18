/**
 * Route Configuration System
 * 
 * Defines permission requirements for different routes in the application.
 * This configuration is used by the route guards to determine access.
 * 
 * Adapted for TanStack React Router (client-side routing)
 */

import type { RoutePermissionConfig } from "@/types/auth";

/**
 * Route permission configurations
 * 
 * Define what permissions/roles are required for each route.
 * Routes not listed here are considered public or inherit from parent routes.
 */
export const routeConfigs: Record<string, RoutePermissionConfig> = {
  // Dashboard routes
  "/dashboard": {
    path: "/dashboard",
    requiresOrganization: true,
    allowSystemAdmin: true,
  },
  
  // User management routes
  "/dashboard/user/view": {
    path: "/dashboard/user/view",
    requiredPermissions: [
      { resource: "user_management", action: "read" }
    ],
    requiresOrganization: true,
    allowSystemAdmin: true,
  },
  
  // Role management routes
  "/dashboard/role/view": {
    path: "/dashboard/role/view",
    requiredPermissions: [
      { resource: "role_management", action: "read" }
    ],
    requiresOrganization: true,
    allowSystemAdmin: true,
  },
  
  // Organization management routes
  "/dashboard/organization": {
    path: "/dashboard/organization",
    requiredRoles: ["Organization Owner"],
    requiresOrganization: true,
    allowSystemAdmin: true,
  },
  
  // Branch management routes
  "/dashboard/branch/view": {
    path: "/dashboard/branch/view",
    requiredPermissions: [
      { resource: "hierarchy_management", action: "read" }
    ],
    requiresOrganization: true,
    allowSystemAdmin: true,
  },
  
  // Service management routes
  "/dashboard/service/view": {
    path: "/dashboard/service/view",
    requiredPermissions: [
      { resource: "service_management", action: "read" }
    ],
    requiresOrganization: true,
    allowSystemAdmin: true,
  },
  
  "/dashboard/service-category/view": {
    path: "/dashboard/service-category/view",
    requiredPermissions: [
      { resource: "service_management", action: "read" }
    ],
    requiresOrganization: true,
    allowSystemAdmin: true,
  },
  
  // Access control routes
  "/dashboard/access-control/invitations": {
    path: "/dashboard/access-control/invitations",
    requiredPermissions: [
      { resource: "user_management", action: "read" }
    ],
    requiresOrganization: true,
    allowSystemAdmin: true,
  },
  
  // Onboarding route - special case for users without organizations
  "/onboarding": {
    path: "/onboarding",
    requiresOrganization: false,
    allowSystemAdmin: true,
  },
};

/**
 * Get route configuration for a given path
 */
export function getRouteConfig(path: string): RoutePermissionConfig | null {
  return routeConfigs[path] || null;
}

/**
 * Check if a route requires specific permissions
 */
export function routeRequiresPermissions(path: string): boolean {
  const config = getRouteConfig(path);
  return config?.requiredPermissions != null && config.requiredPermissions.length > 0;
}

/**
 * Check if a route requires specific roles
 */
export function routeRequiresRoles(path: string): boolean {
  const config = getRouteConfig(path);
  return config?.requiredRoles != null && config.requiredRoles.length > 0;
}

/**
 * Check if a route requires organization context
 */
export function routeRequiresOrganization(path: string): boolean {
  const config = getRouteConfig(path);
  return config?.requiresOrganization === true;
}

/**
 * Check if a route allows system admin access
 */
export function routeAllowsSystemAdmin(path: string): boolean {
  const config = getRouteConfig(path);
  return config?.allowSystemAdmin === true;
}

/**
 * Get all protected routes
 */
export function getProtectedRoutes(): string[] {
  return Object.keys(routeConfigs);
}

/**
 * Get routes that require organization context
 */
export function getOrganizationRoutes(): string[] {
  return Object.entries(routeConfigs)
    .filter(([_, config]) => config.requiresOrganization)
    .map(([path, _]) => path);
}

/**
 * Get routes accessible to system admins
 */
export function getSystemAdminRoutes(): string[] {
  return Object.entries(routeConfigs)
    .filter(([_, config]) => config.allowSystemAdmin)
    .map(([path, _]) => path);
}

/**
 * Common permission sets for reuse
 */
export const COMMON_PERMISSIONS = {
  // User management permissions
  USER_READ: { resource: "user_management", action: "read" },
  USER_CREATE: { resource: "user_management", action: "create" },
  USER_UPDATE: { resource: "user_management", action: "update" },
  USER_DELETE: { resource: "user_management", action: "delete" },
  USER_MANAGE: { resource: "user_management", action: "manage" },
  
  // Role management permissions
  ROLE_READ: { resource: "role_management", action: "read" },
  ROLE_CREATE: { resource: "role_management", action: "create" },
  ROLE_UPDATE: { resource: "role_management", action: "update" },
  ROLE_DELETE: { resource: "role_management", action: "delete" },
  ROLE_MANAGE: { resource: "role_management", action: "manage" },
  
  // Organization management permissions
  ORG_READ: { resource: "organization", action: "read" },
  ORG_UPDATE: { resource: "organization", action: "update" },
  ORG_MANAGE: { resource: "organization", action: "manage" },
  
  // Hierarchy management permissions
  HIERARCHY_READ: { resource: "hierarchy_management", action: "read" },
  HIERARCHY_CREATE: { resource: "hierarchy_management", action: "create" },
  HIERARCHY_UPDATE: { resource: "hierarchy_management", action: "update" },
  HIERARCHY_DELETE: { resource: "hierarchy_management", action: "delete" },
  HIERARCHY_MANAGE: { resource: "hierarchy_management", action: "manage" },
  
  // Subscription management permissions
  SUBSCRIPTION_READ: { resource: "subscription_management", action: "read" },
  SUBSCRIPTION_UPDATE: { resource: "subscription_management", action: "update" },
  SUBSCRIPTION_MANAGE: { resource: "subscription_management", action: "manage" },
} as const;

/**
 * Common role names
 */
export const COMMON_ROLES = {
  ORGANIZATION_OWNER: "Organization Owner",
  MANAGER: "Manager",
  ADMIN: "Admin",
  USER: "User",
} as const;





