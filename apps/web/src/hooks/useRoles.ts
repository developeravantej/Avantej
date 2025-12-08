/**
 * useRoles Hook
 * 
 * TODO: Replace with oRPC client call
 * See: utils/orpc.ts for API client pattern
 * Old API: apiClient.getListroles(...)
 */

import { useState, useEffect, useCallback } from 'react';
// TODO: Replace with oRPC client
// import apiClient from '../lib/api';

interface Role {
  id: string;
  name: string;
  description?: string;
  priority: number;
  organization_id?: string;
  is_system_role: boolean;
  created_at: string;
  permission_count: number;
  user_count: number;
}

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

interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  scope: string;
  created_at: string;
  permission?: Permission;
}

interface RoleWithPermissions extends Role {
  permissions: RolePermission[];
}

interface RolePermissionMatrix {
  roles: RoleWithPermissions[];
  resources: Resource[];
  users_by_role: Record<string, Array<{
    id: string;
    email: string;
    full_name: string;
    is_active: boolean;
  }>>;
}

interface UseRolesResult {
  roles: Role[];
  loading: boolean;
  error: string | null;
  fetchRoles: (organizationId?: string) => Promise<void>;
  createRole: (organizationId: string, data: { name: string; description?: string; priority?: number }) => Promise<Role>;
  updateRole: (roleId: string, data: { name?: string; description?: string; priority?: number }) => Promise<Role>;
  deleteRole: (roleId: string) => Promise<void>;
  getRole: (roleId: string) => Promise<RoleWithPermissions>;
  addPermissionToRole: (roleId: string, permissionId: string, scope?: string) => Promise<RolePermission>;
  removePermissionFromRole: (roleId: string, permissionId: string) => Promise<void>;
  updatePermissionScope: (roleId: string, permissionId: string, scope: string) => Promise<RolePermission>;
  updatePermissionActionScope: (roleId: string, permissionId: string, action: string, scope: string) => Promise<RolePermission>;
}

export function useRoles(): UseRolesResult {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoles = useCallback(async (organizationId?: string) => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.getListroles({ organization_id: organizationId, include_system: true });
      // const roles = await orpc.roles.list.query({ organizationId, includeSystem: true });
      const mockData: Role[] = []; // Mock data - replace with oRPC call
      setRoles(mockData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch roles');
      console.error('Error fetching roles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createRole = useCallback(async (organizationId: string, data: { name: string; description?: string; priority?: number }) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.postCreaterole({ organization_id: organizationId, body: data });
      // const role = await orpc.roles.create.mutate({ organizationId, ...data });
      const mockData = {} as Role; // Mock data - replace with oRPC call
      await fetchRoles(organizationId);
      return mockData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create role';
      setError(message);
      throw new Error(message);
    }
  }, [fetchRoles]);

  const updateRole = useCallback(async (roleId: string, data: { name?: string; description?: string; priority?: number }) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.putUpdaterole(roleId, data);
      // const role = await orpc.roles.update.mutate({ roleId, ...data });
      const mockData = {} as Role; // Mock data - replace with oRPC call
      return mockData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update role';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const deleteRole = useCallback(async (roleId: string) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: await apiClient.deleteRole(roleId);
      // await orpc.roles.delete.mutate({ roleId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete role';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const getRole = useCallback(async (roleId: string) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.getRolebyid(roleId);
      // const role = await orpc.roles.get.query({ roleId });
      const mockData = {} as RoleWithPermissions; // Mock data - replace with oRPC call
      return mockData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch role details';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const addPermissionToRole = useCallback(async (roleId: string, permissionId: string, scope: string = 'own') => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.postAddpermissiontorole(roleId, { permission_id: permissionId, scope });
      // const rolePermission = await orpc.roles.permissions.add.mutate({ roleId, permissionId, scope });
      const mockData = {} as RolePermission; // Mock data - replace with oRPC call
      return mockData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add permission to role';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const removePermissionFromRole = useCallback(async (roleId: string, permissionId: string) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: await apiClient.deleteRemovepermissionfromrole(roleId, permissionId);
      // await orpc.roles.permissions.remove.mutate({ roleId, permissionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove permission from role';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const updatePermissionScope = useCallback(async (roleId: string, permissionId: string, scope: string) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.putUpdatepermissionscope(roleId, permissionId, { scope });
      // const rolePermission = await orpc.roles.permissions.updateScope.mutate({ roleId, permissionId, scope });
      const mockData = {} as RolePermission; // Mock data - replace with oRPC call
      return mockData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update permission scope';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const updatePermissionActionScope = useCallback(async (roleId: string, permissionId: string, action: string, scope: string) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.putUpdatepermissionactionscope(roleId, permissionId, { action, scope });
      // const rolePermission = await orpc.roles.permissions.updateActionScope.mutate({ roleId, permissionId, action, scope });
      const mockData = {} as RolePermission; // Mock data - replace with oRPC call
      return mockData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update permission action scope';
      setError(message);
      throw new Error(message);
    }
  }, []);

  return {
    roles,
    loading,
    error,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    getRole,
    addPermissionToRole,
    removePermissionFromRole,
    updatePermissionScope,
    updatePermissionActionScope
  };
}

interface UseRoleMatrixResult {
  matrix: RolePermissionMatrix | null;
  setMatrix: (matrix: RolePermissionMatrix | null) => void;
  loading: boolean;
  error: string | null;
  fetchMatrix: (organizationId: string) => Promise<void>;
  assignUserToRole: (userId: string, roleId: string, organizationId: string) => Promise<void>;
  removeUserFromRole: (userId: string, roleId: string, organizationId: string) => Promise<void>;
}

export function useRoleMatrix(): UseRoleMatrixResult {
  const [matrix, setMatrix] = useState<RolePermissionMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMatrix = useCallback(async (organizationId: string) => {
    setLoading(true);
    setError(null);
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.getRolepermissionmatrix(organizationId);
      // const matrix = await orpc.roles.matrix.query({ organizationId });
      const mockData: RolePermissionMatrix | null = null; // Mock data - replace with oRPC call
      setMatrix(mockData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch role permission matrix');
      console.error('Error fetching matrix:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const assignUserToRole = useCallback(async (userId: string, roleId: string, organizationId: string) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: await apiClient.postAssignroletouser(userId, organizationId, { role_id: roleId });
      // await orpc.users.roles.assign.mutate({ userId, roleId, organizationId });
      await fetchMatrix(organizationId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign user to role';
      setError(message);
      throw new Error(message);
    }
  }, [fetchMatrix]);

  const removeUserFromRole = useCallback(async (userId: string, roleId: string, organizationId: string) => {
    try {
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: await apiClient.deleteRemoverolefromuser(userId, roleId, organizationId);
      // await orpc.users.roles.remove.mutate({ userId, roleId, organizationId });
      await fetchMatrix(organizationId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove user from role';
      setError(message);
      throw new Error(message);
    }
  }, [fetchMatrix]);

  return {
    matrix,
    setMatrix,
    loading,
    error,
    fetchMatrix,
    assignUserToRole,
    removeUserFromRole
  };
}


