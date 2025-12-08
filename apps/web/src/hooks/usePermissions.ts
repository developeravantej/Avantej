/**
 * usePermissions Hook
 * 
 * TODO: Replace with oRPC client call
 * See: utils/orpc.ts for API client pattern
 * Old API: apiClient.getListpermissions(...)
 */

import { useState, useEffect, useCallback } from 'react';
// TODO: Replace with oRPC client
// import apiClient from '../lib/api';
import { useAuth } from './useAuth';

interface Permission {
  id: string;
  name: string;
  resource_id: string;
  actions: string[];
  field_permissions: Record<string, any>;
  conditions: Record<string, any>;
  description?: string;
  created_at: string;
  resource?: Resource;
}

interface Resource {
  id: string;
  name: string;
  fields: Record<string, any>;
  created_at: string;
}

interface UsePermissionsResult {
  permissions: Permission[];
  resources: Resource[];
  loading: boolean;
  error: string | null;
  fetchPermissions: (resourceId?: string) => Promise<void>;
  fetchResources: () => Promise<void>;
  getPermission: (permissionId: string) => Promise<Permission>;
  getResourcePermissions: (resourceId: string) => Promise<Permission[]>;
}

export function usePermissions(): UsePermissionsResult {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async (resourceId?: string) => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.getListpermissions({ resource_id: resourceId, limit: 200 });
      // const permissions = await orpc.permissions.list.query({ resourceId, limit: 200 });
      const mockData: Permission[] = []; // Mock data - replace with oRPC call
      setPermissions(mockData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch permissions');
      console.error('Error fetching permissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.getListresources();
      // const resources = await orpc.resources.list.query();
      const mockData: Resource[] = []; // Mock data - replace with oRPC call
      setResources(mockData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch resources');
      console.error('Error fetching resources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const getPermission = useCallback(async (permissionId: string) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.getPermissionbyid(permissionId);
      // const permission = await orpc.permissions.get.query({ permissionId });
      const mockData = {} as Permission; // Mock data - replace with oRPC call
      return mockData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch permission details';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const getResourcePermissions = useCallback(async (resourceId: string) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.getResourcepermissions(resourceId);
      // const permissions = await orpc.resources.permissions.query({ resourceId });
      const mockData: Permission[] = []; // Mock data - replace with oRPC call
      return mockData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch resource permissions';
      setError(message);
      throw new Error(message);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  return {
    permissions,
    resources,
    loading,
    error,
    fetchPermissions,
    fetchResources,
    getPermission,
    getResourcePermissions
  };
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


