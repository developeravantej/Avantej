/**
 * useAuth Hook - Better-Auth Integration
 * 
 * Wraps Better-Auth client to provide a compatible API surface
 * for components that were using the old useAuth hook.
 * 
 * TODO: Integrate permission checking with Better-Auth permission system
 */

import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { useUserContext } from "./useUserContext";
import type {
  AuthState,
  LoginCredentials,
  UserWithPermissions,
  AuthSession,
  RequiredPermission,
  FlattenedPermission,
  UseAuthReturn,
  OrganizationData,
} from "@/types/auth";
import { isUserWithPermissions } from "@/types/auth";
import { flattenUserPermissions, checkUserPermission, checkUserRole } from "@/lib/permissions";
import { getServerUrl } from "@/lib/config";

export function useAuth(): UseAuthReturn {
  const navigate = useNavigate();
  const { data: session, isPending, refetch } = authClient.useSession();

  // Use React Query hook for user context (organizations + hierarchy)
  const { data: userContext, isLoading: isLoadingContext } = useUserContext(
    !!session?.user // Only fetch if session exists
  );

  // Derive organizations from React Query data
  const organizations = useMemo(() => {
    return userContext?.organizations?.map(org => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      role: org.role,
    })) || [];
  }, [userContext]);

  const currentOrganizationId = useMemo(() => {
    return userContext?.currentOrganizationId || organizations[0]?.id || null;
  }, [userContext, organizations]);

  // Convert Better-Auth session to AuthState format
  const authState: AuthState = useMemo(() => {
    if (isPending) {
      return {
        user: null,
        session: null,
        isLoading: true,
        isAuthenticated: false,
        error: null,
      };
    }

    if (!session?.user) {
      return {
        user: null,
        session: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      };
    }

    const user: UserWithPermissions = {
      id: session.user.id,
      email: session.user.email,
      full_name: session.user.name || "",
      phone: null,
      is_system_admin: false,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login: null,
      organizations: organizations.map(org => ({
        id: org.id,
        name: org.name,
        roles: [{ 
          id: `role-${org.id}-${org.role}`, 
          name: org.role, 
          priority: 0, 
          description: '',
          permissions: [] as any[]
        }],
      })),
      current_organization_id: currentOrganizationId || (organizations.length > 0 ? organizations[0].id : null),
    };

    const authSession: AuthSession = {
      token: "", // Better-Auth handles tokens internally
      active: true,
    };

    return {
      user,
      session: authSession,
      isLoading: false,
      isAuthenticated: true,
      error: null,
    };
  }, [session, isPending, isLoadingContext, organizations, currentOrganizationId]);

  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      await refetch();
      return !!session?.user;
    } catch (error: any) {
      console.error("Auth check failed:", error);
      return false;
    }
  }, [refetch, session]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      const result = await authClient.signIn.email({
        email: credentials.email,
        password: credentials.password,
      });

      if (result.error) {
        return { success: false, error: result.error.message };
      }

      // Refresh session after login
      await refetch();

      // React Query will automatically fetch user-context when session exists
      // No need to manually fetch here - useUserContext hook handles it

      return { success: true, data: result.data };
    } catch (error: any) {
      console.error("Login error:", error);
      return { success: false, error: error.message || "Login failed" };
    }
  }, [refetch]);

  const logout = useCallback(async () => {
    try {
      await authClient.signOut();
      await refetch();
      // Clear localStorage
      localStorage.removeItem('user_organizations');
      localStorage.removeItem('current_organization_id');
      // Clear hierarchy cache
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('org_') && key.endsWith('_hierarchy')) {
          localStorage.removeItem(key);
        }
      });
      navigate({ to: "/login" });
    } catch (error) {
      console.error("Logout error:", error);
      // Clear localStorage even on error
      localStorage.removeItem('user_organizations');
      localStorage.removeItem('current_organization_id');
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('org_') && key.endsWith('_hierarchy')) {
          localStorage.removeItem(key);
        }
      });
      navigate({ to: "/login" });
    }
  }, [navigate, refetch]);

  const requireAuth = useCallback((redirectTo: string = "/login") => {
    if (!authState.isLoading && !authState.isAuthenticated) {
      navigate({ to: redirectTo });
    }
  }, [authState, navigate]);

  const hasPermission = useCallback((permission: RequiredPermission, organizationId?: string): boolean => {
    if (!authState.user) return false;
    const result = checkUserPermission(authState.user, permission, organizationId);
    return result.hasPermission;
  }, [authState.user]);

  const hasRole = useCallback((roleName: string, organizationId?: string): boolean => {
    if (!authState.user) return false;
    const result = checkUserRole(authState.user, roleName, organizationId);
    return result.hasPermission;
  }, [authState.user]);

  const flattenPermissions = useCallback((): FlattenedPermission[] => {
    if (!authState.user) return [];
    return flattenUserPermissions(authState.user);
  }, [authState.user]);

  // Memoized flattened permissions and maps for performance
  const flattenedPermissions = useMemo(() => {
    return flattenPermissions();
  }, [flattenPermissions]);

  const permissionMap = useMemo(() => {
    const map = new Map<string, boolean>();
    flattenedPermissions.forEach(perm => {
      perm.actions.forEach(action => {
        const key = `${perm.resource}:${action}:${perm.organizationId}:${perm.scope}`;
        map.set(key, true);
      });
    });
    return map;
  }, [flattenedPermissions]);

  const roleMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (authState.user) {
      authState.user.organizations.forEach(org => {
        org.roles.forEach(role => {
          map.set(`${org.id}:${role.name}`, true);
        });
      });
    }
    return map;
  }, [authState.user]);

  const commonPermissions = useMemo(() => {
    if (!authState.user) {
      return {
        canViewUsers: false,
        canCreateUsers: false,
        canUpdateUsers: false,
        canDeleteUsers: false,
        canManageUsers: false,
        canViewRoles: false,
        canCreateRoles: false,
        canUpdateRoles: false,
        canDeleteRoles: false,
        canManageRoles: false,
        canViewOrganization: false,
        canUpdateOrganization: false,
        canManageOrganization: false,
        canViewHierarchy: false,
        canCreateHierarchy: false,
        canUpdateHierarchy: false,
        canDeleteHierarchy: false,
        canManageHierarchy: false,
        isSystemAdmin: false,
        isOrganizationOwner: false,
      };
    }

    return {
      canViewUsers: hasPermission({ resource: "user_management", action: "read" }),
      canCreateUsers: hasPermission({ resource: "user_management", action: "create" }),
      canUpdateUsers: hasPermission({ resource: "user_management", action: "update" }),
      canDeleteUsers: hasPermission({ resource: "user_management", action: "delete" }),
      canManageUsers: hasPermission({ resource: "user_management", action: "manage" }),
      canViewRoles: hasPermission({ resource: "role_management", action: "read" }),
      canCreateRoles: hasPermission({ resource: "role_management", action: "create" }),
      canUpdateRoles: hasPermission({ resource: "role_management", action: "update" }),
      canDeleteRoles: hasPermission({ resource: "role_management", action: "delete" }),
      canManageRoles: hasPermission({ resource: "role_management", action: "manage" }),
      canViewOrganization: hasPermission({ resource: "organization", action: "read" }),
      canUpdateOrganization: hasPermission({ resource: "organization", action: "update" }),
      canManageOrganization: hasPermission({ resource: "organization", action: "manage" }),
      canViewHierarchy: hasPermission({ resource: "hierarchy_management", action: "read" }),
      canCreateHierarchy: hasPermission({ resource: "hierarchy_management", action: "create" }),
      canUpdateHierarchy: hasPermission({ resource: "hierarchy_management", action: "update" }),
      canDeleteHierarchy: hasPermission({ resource: "hierarchy_management", action: "delete" }),
      canManageHierarchy: hasPermission({ resource: "hierarchy_management", action: "manage" }),
      isSystemAdmin: authState.user.is_system_admin,
      isOrganizationOwner: hasRole("Organization Owner"),
    };
  }, [authState.user, hasPermission, hasRole]);

  return {
    ...authState,
    login,
    logout,
    checkAuth,
    requireAuth,
    hasPermission,
    hasRole,
    flattenPermissions,
    flattenedPermissions,
    permissionMap,
    roleMap,
    commonPermissions,
  };
}





