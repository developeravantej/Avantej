/**
 * useUserAssignment Hook
 * 
 * TODO: Replace with oRPC client call
 * See: utils/orpc.ts for API client pattern
 * Old API: apiClient.getListusers(...), apiClient.getUserroles(...)
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
// TODO: Replace with oRPC client
// import apiClient from '@/lib/api';
import type { 
  UserForAssignment, 
  RoleResponse, 
  RoleAssignmentState,
  UserListParams,
  RoleListParams,
  AssignmentResult
} from '@/types/user-assignment';
import type { User } from '@/types/auth';

export function useUserAssignment() {
  const { user: currentUser } = useAuth();
  const [state, setState] = useState<RoleAssignmentState>({
    isLoading: false,
    isSaving: false,
    error: null,
    successMessage: null,
  });
  
  const [users, setUsers] = useState<UserForAssignment[]>([]);
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  // Transform backend user to UserForAssignment
  const transformUserForAssignment = useCallback((user: User): UserForAssignment => {
    return {
      ...user,
      name: user.full_name,
      roles: [], // Will be populated from user roles API
      lastLogin: user.last_login || undefined,
      isActive: user.is_active,
      department: undefined, // This might come from metadata or separate API
    };
  }, []);

  // Get current organization ID
  useEffect(() => {
    if (currentUser?.current_organization_id) {
      setOrganizationId(currentUser.current_organization_id);
    } else if (currentUser?.organizations && currentUser.organizations.length > 0) {
      // Default to first organization if no current one is set
      setOrganizationId(currentUser.organizations[0].id);
    }
  }, [currentUser]);

  // Fetch users with error handling
  const fetchUsers = useCallback(async (params: UserListParams = {}) => {
    if (!organizationId) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log('Fetching users with params:', params);
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.getListusers(params);
      // const users = await orpc.users.list.query(params);
      const mockUsers: User[] = []; // Mock data - replace with oRPC call
      
      // Transform users and fetch their roles
      const transformedUsers = await Promise.all(
        mockUsers.map(async (user) => {
          const transformedUser = transformUserForAssignment(user);
          
          // Fetch user roles
          try {
            // TODO: Replace with oRPC client call
            // See: utils/orpc.ts for API client pattern
            // Old API: const roleResponse = await apiClient.getUserroles(user.id, organizationId);
            // const userRoles = await orpc.users.roles.query({ userId: user.id, organizationId });
            transformedUser.roles = []; // Mock data - replace with oRPC call
          } catch (error) {
            console.warn(`Failed to fetch roles for user ${user.id}:`, error);
            transformedUser.roles = [];
          }
          
          return transformedUser;
        })
      );
      
      setUsers(transformedUsers);
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Failed to load users. Please try again.' 
      }));
    }
  }, [organizationId, transformUserForAssignment]);

  // Fetch roles with error handling
  const fetchRoles = useCallback(async (params: RoleListParams = {}) => {
    if (!organizationId) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log('Fetching roles with params:', { ...params, organization_id: organizationId });
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const response = await apiClient.getListroles({ ...params, organization_id: organizationId, include_system: true });
      // const roles = await orpc.roles.list.query({ ...params, organizationId, includeSystem: true });
      const mockData: RoleResponse[] = []; // Mock data - replace with oRPC call
      setRoles(mockData);
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('Failed to fetch roles:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Failed to load roles. Please try again.' 
      }));
    }
  }, [organizationId]);

  // Assign multiple roles to a user
  const assignRolesToUser = useCallback(async (
    userId: string, 
    roleIds: string[]
  ): Promise<AssignmentResult> => {
    if (!organizationId) {
      return { success: false, message: 'No organization context available' };
    }

    setState(prev => ({ ...prev, isSaving: true, error: null, successMessage: null }));
    
    try {
      // Get current user roles to determine what to add/remove
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: const currentRolesResponse = await apiClient.getUserroles(userId, organizationId);
      // const currentUserRoles = await orpc.users.roles.query({ userId, organizationId });
      const currentRoleIds: string[] = []; // Mock data - replace with oRPC call
      
      const rolesToAdd = roleIds.filter(roleId => !currentRoleIds.includes(roleId));
      const rolesToRemove = currentRoleIds.filter(roleId => !roleIds.includes(roleId));
      
      const errors: string[] = [];
      
      // Remove roles that are no longer selected
      for (const roleId of rolesToRemove) {
        try {
          // TODO: Replace with oRPC client call
          // See: utils/orpc.ts for API client pattern
          // Old API: await apiClient.deleteRemoverolefromuser(userId, roleId, organizationId);
          // await orpc.users.roles.remove.mutate({ userId, roleId, organizationId });
        } catch (error) {
          console.error(`Failed to remove role ${roleId}:`, error);
          errors.push(`Failed to remove role ${roleId}`);
        }
      }
      
      // Add new roles
      for (const roleId of rolesToAdd) {
        try {
          // TODO: Replace with oRPC client call
          // See: utils/orpc.ts for API client pattern
          // Old API: await apiClient.postAssignroletouser(userId, organizationId, { role_id: roleId });
          // await orpc.users.roles.assign.mutate({ userId, roleId, organizationId });
        } catch (error) {
          console.error(`Failed to assign role ${roleId}:`, error);
          errors.push(`Failed to assign role ${roleId}`);
        }
      }
      
      // Update user in local state
      setUsers(prev => prev.map(user => 
        user.id === userId 
          ? { ...user, roles: roleIds }
          : user
      ));
      
      const result: AssignmentResult = {
        success: errors.length === 0,
        message: errors.length === 0 
          ? 'Roles updated successfully' 
          : `Partially completed with ${errors.length} errors`,
        errors: errors.length > 0 ? errors : undefined
      };
      
      setState(prev => ({ 
        ...prev, 
        isSaving: false, 
        successMessage: result.message,
        error: errors.length > 0 ? errors.join(', ') : null
      }));
      
      return result;
    } catch (error) {
      console.error('Failed to update user roles:', error);
      const errorMessage = 'Failed to update user roles. Please try again.';
      setState(prev => ({ 
        ...prev, 
        isSaving: false, 
        error: errorMessage 
      }));
      
      return { success: false, message: errorMessage };
    }
  }, [organizationId]);

  // Toggle user active status
  const toggleUserStatus = useCallback(async (userId: string): Promise<AssignmentResult> => {
    setState(prev => ({ ...prev, isSaving: true, error: null, successMessage: null }));
    
    try {
      const user = users.find(u => u.id === userId);
      if (!user) {
        return { success: false, message: 'User not found' };
      }
      
      // Update user status via API
      // TODO: Replace with oRPC client call
      // See: utils/orpc.ts for API client pattern
      // Old API: await apiClient.putUpdateuser(userId, { is_active: !user.isActive });
      // await orpc.users.update.mutate({ userId, isActive: !user.isActive });
      
      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === userId 
          ? { ...u, isActive: !u.isActive }
          : u
      ));
      
      setState(prev => ({ 
        ...prev, 
        isSaving: false, 
        successMessage: `User ${user.isActive ? 'deactivated' : 'activated'} successfully` 
      }));
      
      return { 
        success: true, 
        message: `User ${user.isActive ? 'deactivated' : 'activated'} successfully` 
      };
    } catch (error) {
      console.error('Failed to toggle user status:', error);
      const errorMessage = 'Failed to update user status. Please try again.';
      setState(prev => ({ 
        ...prev, 
        isSaving: false, 
        error: errorMessage 
      }));
      
      return { success: false, message: errorMessage };
    }
  }, [users]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setState(prev => ({ ...prev, error: null, successMessage: null }));
  }, []);

  // Initialize data loading
  useEffect(() => {
    if (organizationId) {
      fetchUsers();
      fetchRoles();
    }
  }, [organizationId, fetchUsers, fetchRoles]);

  return {
    // State
    users,
    roles,
    organizationId,
    isLoading: state.isLoading,
    isSaving: state.isSaving,
    error: state.error,
    successMessage: state.successMessage,
    
    // Actions
    fetchUsers,
    fetchRoles,
    assignRolesToUser,
    toggleUserStatus,
    clearMessages,
    
    // Utilities
    transformUserForAssignment,
  };
}




