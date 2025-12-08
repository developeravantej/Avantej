/**
 * Authentication and Permission Types
 * 
 * These types match the backend schemas for user authentication,
 * roles, permissions, and organizations.
 * 
 * TODO: Adapt for Better-Auth integration
 */

// Base permission data structure
export interface PermissionData {
  resource: string;
  actions: string[];
  scope: "own" | "team" | "organization";
  field_permissions: Record<string, any>;
  conditions: Record<string, any>;
}

// Role data structure
export interface RoleData {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  permissions: PermissionData[];
}

// Organization data structure
export interface OrganizationData {
  id: string;
  name: string;
  roles: RoleData[];
}

// Base user interface (matches backend UserResponse)
export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_system_admin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

// Extended user interface with permissions (matches backend UserWithPermissions)
export interface UserWithPermissions extends User {
  organizations: OrganizationData[];
  current_organization_id: string | null;
}

// Authentication state interface
export interface AuthState {
  user: UserWithPermissions | null;
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

// Session data structure
export interface AuthSession {
  token: string;
  active: boolean;
}

// Login/Register request interfaces
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  full_name: string;
  phone?: string;
}

// Permission checking interfaces
export interface RequiredPermission {
  resource: string;
  action: string;
  scope?: "own" | "team" | "organization";
}

export interface PermissionCheckResult {
  hasPermission: boolean;
  reason?: string;
}

// Organization context interface
export interface OrganizationContext {
  currentOrganization: OrganizationData | null;
  availableOrganizations: OrganizationData[];
  switchOrganization: (orgId: string) => void;
}

// Flattened permission for easier checking
export interface FlattenedPermission extends PermissionData {
  organizationId: string;
  roleName: string;
  roleId: string;
}

// Route permission configuration
export interface RoutePermissionConfig {
  path: string;
  requiredRoles?: string[];
  requiredPermissions?: RequiredPermission[];
  requiresOrganization?: boolean;
  allowSystemAdmin?: boolean;
}

// Common permissions interface for quick access
export interface CommonPermissions {
  // User management
  canViewUsers: boolean;
  canCreateUsers: boolean;
  canUpdateUsers: boolean;
  canDeleteUsers: boolean;
  canManageUsers: boolean;
  
  // Role management
  canViewRoles: boolean;
  canCreateRoles: boolean;
  canUpdateRoles: boolean;
  canDeleteRoles: boolean;
  canManageRoles: boolean;
  
  // Organization management
  canViewOrganization: boolean;
  canUpdateOrganization: boolean;
  canManageOrganization: boolean;
  
  // Hierarchy management
  canViewHierarchy: boolean;
  canCreateHierarchy: boolean;
  canUpdateHierarchy: boolean;
  canDeleteHierarchy: boolean;
  canManageHierarchy: boolean;
  
  // Common roles
  isSystemAdmin: boolean;
  isOrganizationOwner: boolean;
}

// Auth hook return type
export interface UseAuthReturn extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string; data?: any }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
  requireAuth: (redirectTo?: string) => void;
  hasPermission: (permission: RequiredPermission, organizationId?: string) => boolean;
  hasRole: (roleName: string, organizationId?: string) => boolean;
  flattenPermissions: () => FlattenedPermission[];
  // New optimized properties
  flattenedPermissions: FlattenedPermission[];
  permissionMap: Map<string, boolean>;
  roleMap: Map<string, boolean>;
  commonPermissions: CommonPermissions;
}

// Type guards
export function isUserWithPermissions(user: any): user is UserWithPermissions {
  return user && typeof user === 'object' && 
         'organizations' in user && 
         Array.isArray(user.organizations);
}

export function isPermissionData(permission: any): permission is PermissionData {
  return permission && 
         typeof permission === 'object' &&
         typeof permission.resource === 'string' &&
         Array.isArray(permission.actions) &&
         typeof permission.scope === 'string';
}


