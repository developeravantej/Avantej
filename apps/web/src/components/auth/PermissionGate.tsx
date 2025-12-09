/**
 * Permission Gate Component
 *
 * Conditionally renders children based on user permissions.
 * Supports both permission and role-based access control.
 */

import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  checkUserPermission,
  checkUserRole,
  checkUserHasAnyRole,
  checkUserPermissions,
} from "@/lib/permissions";
import type { RequiredPermission, UserWithPermissions } from "@/types/auth";
import { isUserWithPermissions } from "@/types/auth";

interface PermissionGateProps {
  children: ReactNode;

  // Permission-based access
  permission?: RequiredPermission;
  permissions?: RequiredPermission[]; // All required (AND logic)
  anyPermission?: RequiredPermission[]; // Any required (OR logic)

  // Role-based access
  role?: string;
  roles?: string[]; // Any required (OR logic)

  // Organization context
  organizationId?: string;

  // System admin override
  allowSystemAdmin?: boolean;

  // Fallback content when access is denied
  fallback?: ReactNode;

  // Show loading state while checking auth
  showLoading?: boolean;
}

export function PermissionGate({
  children,
  permission,
  permissions,
  anyPermission,
  role,
  roles,
  organizationId,
  allowSystemAdmin = true,
  fallback = null,
  showLoading = false,
}: PermissionGateProps) {
  const { user, isLoading, isAuthenticated } = useAuth();

  // Show loading state if requested
  if (isLoading && showLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      </div>
    );
  }

  // User must be authenticated
  if (!isAuthenticated || !user || !isUserWithPermissions(user)) {
    return <>{fallback}</>;
  }

  // System admin check
  if (allowSystemAdmin && user.is_system_admin) {
    return <>{children}</>;
  }

  // Determine organization context
  const orgId = organizationId || user.current_organization_id || undefined;

  // Single permission check
  if (permission) {
    const result = checkUserPermission(user, permission, orgId);
    if (!result.hasPermission) {
      return <>{fallback}</>;
    }
  }

  // Multiple permissions check (AND logic)
  if (permissions && permissions.length > 0) {
    const result = checkUserPermissions(user, permissions, orgId);
    if (!result.hasPermission) {
      return <>{fallback}</>;
    }
  }

  // Any permission check (OR logic)
  if (anyPermission && anyPermission.length > 0) {
    const hasAnyPermission = anyPermission.some(
      (perm) => checkUserPermission(user, perm, orgId).hasPermission
    );
    if (!hasAnyPermission) {
      return <>{fallback}</>;
    }
  }

  // Single role check
  if (role) {
    const result = checkUserRole(user, role, orgId);
    if (!result.hasPermission) {
      return <>{fallback}</>;
    }
  }

  // Multiple roles check (OR logic)
  if (roles && roles.length > 0) {
    const result = checkUserHasAnyRole(user, roles, orgId);
    if (!result.hasPermission) {
      return <>{fallback}</>;
    }
  }

  // All checks passed
  return <>{children}</>;
}

// Convenience components for common use cases

interface RoleGateProps {
  children: ReactNode;
  role: string;
  organizationId?: string;
  fallback?: ReactNode;
  allowSystemAdmin?: boolean;
}

export function RoleGate({
  children,
  role,
  organizationId,
  fallback = null,
  allowSystemAdmin = true,
}: RoleGateProps) {
  return (
    <PermissionGate
      role={role}
      organizationId={organizationId}
      fallback={fallback}
      allowSystemAdmin={allowSystemAdmin}
    >
      {children}
    </PermissionGate>
  );
}

interface SystemAdminGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function SystemAdminGate({
  children,
  fallback = null,
}: SystemAdminGateProps) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user || !user.is_system_admin) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

interface OrganizationOwnerGateProps {
  children: ReactNode;
  organizationId?: string;
  fallback?: ReactNode;
}

export function OrganizationOwnerGate({
  children,
  organizationId,
  fallback = null,
}: OrganizationOwnerGateProps) {
  return (
    <RoleGate
      role="Organization Owner"
      organizationId={organizationId}
      fallback={fallback}
    >
      {children}
    </RoleGate>
  );
}





