/**
 * usePermissions Hook
 *
 * Provides permission and role-permission queries using oRPC client.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { orpc } from '@/utils/orpc';
import { useAuth } from './useAuth';

export function usePermissions(organizationId: string, resource?: string) {
  const permissionsQuery = useQuery({
    ...orpc.permissions.list.queryOptions({ organizationId, resource }),
    enabled: !!organizationId,
  });

  const rolePermissionsQuery = useQuery({
    ...orpc.rolePermissions.list.queryOptions({ organizationId }),
    enabled: !!organizationId,
  });

  return { permissionsQuery, rolePermissionsQuery };
}

// Hook for checking specific permissions
interface UsePermissionProps {
  resource: string;
  action: string;
  scope?: string;
}

interface UsePermissionResult {
  hasPermission: boolean;
  loading: boolean;
}

export function usePermission({ resource, action, scope = 'own' }: UsePermissionProps): UsePermissionResult {
  const { user, hasPermission: authHasPermission } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading for consistency
    setLoading(false);
  }, []);

  const hasPermission = authHasPermission ? authHasPermission({ 
    resource, 
    action, 
    scope: scope as 'own' | 'team' | 'organization' | undefined 
  }) : false;

  return {
    hasPermission,
    loading
  };
}

// Hook for checking roles
interface UseRoleResult {
  hasRole: boolean;
  loading: boolean;
}

export function useRole(roleName: string): UseRoleResult {
  const { user, hasRole: authHasRole } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  const hasRole = authHasRole ? authHasRole(roleName) : false;

  return {
    hasRole,
    loading
  };
}

// Hook for checking system admin status
interface UseIsSystemAdminResult {
  isSystemAdmin: boolean;
  loading: boolean;
}

export function useIsSystemAdmin(): UseIsSystemAdminResult {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  return {
    isSystemAdmin: user?.is_system_admin || false,
    loading
  };
}

// Hook for common permissions
interface CommonPermissions {
  canViewUsers: boolean;
  canCreateUsers: boolean;
  canEditUsers: boolean;
  canDeleteUsers: boolean;
  canViewRoles: boolean;
  canCreateRoles: boolean;
  canEditRoles: boolean;
  canDeleteRoles: boolean;
  canManageOrganization: boolean;
  isOrganizationOwner: boolean;
  isSystemAdmin: boolean;
}

export function useCommonPermissions(): CommonPermissions {
  const { user, hasPermission, hasRole } = useAuth();

  return {
    canViewUsers: hasPermission ? hasPermission({ resource: 'user_management', action: 'read' }) : false,
    canCreateUsers: hasPermission ? hasPermission({ resource: 'user_management', action: 'create' }) : false,
    canEditUsers: hasPermission ? hasPermission({ resource: 'user_management', action: 'update' }) : false,
    canDeleteUsers: hasPermission ? hasPermission({ resource: 'user_management', action: 'delete' }) : false,
    canViewRoles: hasPermission ? hasPermission({ resource: 'role_management', action: 'read' }) : false,
    canCreateRoles: hasPermission ? hasPermission({ resource: 'role_management', action: 'create' }) : false,
    canEditRoles: hasPermission ? hasPermission({ resource: 'role_management', action: 'update' }) : false,
    canDeleteRoles: hasPermission ? hasPermission({ resource: 'role_management', action: 'delete' }) : false,
    canManageOrganization: hasPermission ? hasPermission({ resource: 'organization', action: 'manage' }) : false,
    isOrganizationOwner: hasRole ? hasRole('Organization Owner') : false,
    isSystemAdmin: user?.is_system_admin || false,
  };
}


