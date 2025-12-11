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

  // State for organizations and current organization ID
  // API returns: { id, name, slug, role }
  // We convert to OrganizationData format: { id, name, roles: [{ name: role }] }
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; slug: string; role: string }>>([]);
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null);
  const hasFetchedUserContext = useRef(false);

  // Load organizations from localStorage on initial render
  useEffect(() => {
    try {
      const storedOrgs = localStorage.getItem('user_organizations');
      const storedCurrentOrgId = localStorage.getItem('current_organization_id');
      if (storedOrgs) {
        setOrganizations(JSON.parse(storedOrgs));
      }
      if (storedCurrentOrgId) {
        setCurrentOrganizationId(storedCurrentOrgId);
      }
    } catch (error) {
      console.error('Failed to load organizations from localStorage:', error);
    }
  }, []);

  // Effect to fetch user context (organizations + hierarchy) when session exists
  // Only fetch once per session to avoid infinite loops
  useEffect(() => {
    const fetchUserContext = async () => {
      // Only fetch if we have a session and haven't fetched yet for this session
      if (session?.user && !hasFetchedUserContext.current) {
        hasFetchedUserContext.current = true;
        const serverUrl = getServerUrl();
        try {
          // Try user-context endpoint first (includes hierarchy data)
          const contextResponse = await fetch(`${serverUrl}/auth/user-context`, {
            method: 'GET',
            credentials: 'include',
          });

          if (contextResponse.ok) {
            const contextData = await contextResponse.json();
            
            // Store organizations
            if (contextData.organizations && contextData.organizations.length > 0) {
              const orgsSummary = contextData.organizations.map((org: any) => ({
                id: org.id,
                name: org.name,
                slug: org.slug,
                role: org.role,
              }));
              
              setOrganizations(orgsSummary);
              const currentOrgId = contextData.currentOrganizationId || orgsSummary[0].id;
              setCurrentOrganizationId(currentOrgId);
              
              localStorage.setItem('user_organizations', JSON.stringify(orgsSummary));
              localStorage.setItem('current_organization_id', currentOrgId);
              
              // Store hierarchy data in localStorage for quick access
              contextData.organizations.forEach((org: any) => {
                if (org.hierarchy?.nodes) {
                  localStorage.setItem(`org_${org.id}_hierarchy`, JSON.stringify(org.hierarchy));
                }
              });
              
              await refetch(); // Trigger a refetch to update the user object
              return;
            }
          }
          
          // Fallback to old organizations endpoint if user-context fails
          const orgResponse = await fetch(`${serverUrl}/auth/organizations`, {
            method: 'GET',
            credentials: 'include',
          });

          if (orgResponse.ok) {
            const orgData = await orgResponse.json();
            if (orgData.organizations && orgData.organizations.length > 0) {
              setOrganizations(orgData.organizations);
              const firstOrgId = orgData.organizations[0].id;
              setCurrentOrganizationId(firstOrgId);
              localStorage.setItem('user_organizations', JSON.stringify(orgData.organizations));
              localStorage.setItem('current_organization_id', firstOrgId);
              await refetch(); // Trigger a refetch to update the user object
            }
          } else {
            const errorData = await orgResponse.json().catch(() => ({}));
            console.error('Failed to fetch organizations:', errorData);
          }
        } catch (error) {
          console.error('Error fetching user context:', error);
          hasFetchedUserContext.current = false; // Reset on error so we can retry
          // If fetch fails, ensure we at least have localStorage data
          if (organizations.length === 0) {
            const storedOrgs = localStorage.getItem('user_organizations');
            const storedOrgId = localStorage.getItem('current_organization_id');
            if (storedOrgs) {
              try {
                const parsedOrgs = JSON.parse(storedOrgs);
                setOrganizations(parsedOrgs);
                if (storedOrgId) {
                  setCurrentOrganizationId(storedOrgId);
                } else if (parsedOrgs.length > 0) {
                  setCurrentOrganizationId(parsedOrgs[0].id);
                }
              } catch (e) {
                console.error('Failed to parse stored organizations:', e);
              }
            }
          }
        }
      } else if (!session?.user) {
        // Reset flag when user logs out
        hasFetchedUserContext.current = false;
      }
    };
    fetchUserContext();
  }, [session?.user?.id, refetch]); // Only depend on user ID, not the whole session object

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
  }, [session, isPending, organizations, currentOrganizationId]);

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

      // Fetch organizations after successful login
      const serverUrl = getServerUrl();
      try {
        const orgResponse = await fetch(`${serverUrl}/auth/organizations`, {
          method: 'GET',
          credentials: 'include',
        });

        if (orgResponse.ok) {
          const orgData = await orgResponse.json();
          if (orgData.organizations && orgData.organizations.length > 0) {
            localStorage.setItem('user_organizations', JSON.stringify(orgData.organizations));
            localStorage.setItem('current_organization_id', orgData.organizations[0].id);
            setOrganizations(orgData.organizations);
            setCurrentOrganizationId(orgData.organizations[0].id);
          }
        } else {
          const errorData = await orgResponse.json().catch(() => ({}));
          console.error('Failed to fetch organizations:', errorData);
        }
      } catch (orgError) {
        console.error('Error fetching organizations:', orgError);
      }

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
      localStorage.removeItem('user_organizations');
      localStorage.removeItem('current_organization_id');
      setOrganizations([]);
      setCurrentOrganizationId(null);
      navigate({ to: "/login" });
    } catch (error) {
      console.error("Logout error:", error);
      localStorage.removeItem('user_organizations');
      localStorage.removeItem('current_organization_id');
      setOrganizations([]);
      setCurrentOrganizationId(null);
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





