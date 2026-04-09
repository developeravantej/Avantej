import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";

export interface UserContextResponse {
  user: {
    id: string;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
    emailVerified: boolean;
  };
  isSystemAdmin?: boolean;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
    /** Flat list of "resource:action" strings the member's role grants in this org */
    permissions?: string[];
    hierarchy: {
      nodes: Array<{
        id: string;
        name: string;
        type: string;
        depth: number;
        parentId: string | null;
        createdAt: Date | null;
        updatedAt: Date | null;
      }>;
      member: {
        role: string;
        hierarchyScopeId: string;
        hierarchyScopeName: string;
        accessibleNodeIds: string[];
      } | null;
    };
  }>;
  currentOrganizationId: string | null;
}

// Mock data for development (when API is not available).
// currentOrganizationId is null so we never send mock "org-1" to the API (server expects UUID).
const _MOCK_USER_CONTEXT: UserContextResponse = {
  user: {
    id: "mock-user-1",
    email: "demo@avantej.com",
    name: "Demo User",
    firstName: "Demo",
    lastName: "User",
    emailVerified: true,
  },
  isSystemAdmin: false,
  organizations: [
    {
      id: "org-1",
      name: "Demo Franchise",
      slug: "demo-franchise",
      role: "Organization Owner",
      permissions: [],
      hierarchy: {
        nodes: [
          {
            id: "node-1",
            name: "Headquarters",
            type: "region",
            depth: 0,
            parentId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: "node-2",
            name: "Branch A",
            type: "branch",
            depth: 1,
            parentId: "node-1",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: "node-3",
            name: "Branch B",
            type: "branch",
            depth: 1,
            parentId: "node-1",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        member: {
          role: "Organization Owner",
          hierarchyScopeId: "node-1",
          hierarchyScopeName: "Headquarters",
          accessibleNodeIds: ["node-1", "node-2", "node-3"],
        },
      },
    },
  ],
  currentOrganizationId: null,
};

export function useUserContext(enabled = true) {
  const query = useQuery<UserContextResponse>({
    queryKey: ["user-context"],
    queryFn: async () => {
      // Use oRPC client for type-safe API calls
      const data = await client.auth.userContext({});

      // Persist to localStorage for offline/quick access
      if (data.organizations?.length > 0) {
        localStorage.setItem("user_organizations", JSON.stringify(
          data.organizations.map((org) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            role: org.role,
            // permissions may not exist in older cached responses — default to []
            permissions: (org as { permissions?: string[] }).permissions ?? [],
          }))
        ));
        localStorage.setItem("current_organization_id", data.currentOrganizationId || data.organizations[0].id);

        // Cache hierarchy data
        data.organizations.forEach((org) => {
          if (org.hierarchy?.nodes) {
            localStorage.setItem(`org_${org.id}_hierarchy`, JSON.stringify(org.hierarchy));
          }
        });
      }

      return data as UserContextResponse;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - data doesn't change often
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    retry: 1,
    // Use localStorage as initial data if available (faster first render).
    // Don't use stored "org-1" as currentOrganizationId (server expects UUID).
    initialData: () => {
      try {
        const storedOrgs = localStorage.getItem("user_organizations");
        const storedOrgId = localStorage.getItem("current_organization_id");
        if (storedOrgs && storedOrgId) {
          const orgs = JSON.parse(storedOrgs);
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storedOrgId);
          return {
            user: {
              id: "",
              email: "",
              name: "",
              firstName: "",
              lastName: "",
              emailVerified: false,
            },
            isSystemAdmin: false,
            organizations: orgs.map((org: { id: string; name: string; slug: string; role: string; permissions?: string[] }) => {
              let hierarchy: UserContextResponse["organizations"][0]["hierarchy"] = { nodes: [], member: null };
              try {
                const cachedHierarchy = localStorage.getItem(`org_${org.id}_hierarchy`);
                if (cachedHierarchy) {
                  hierarchy = JSON.parse(cachedHierarchy);
                }
              } catch {
                // ignore
              }
              return { ...org, permissions: org.permissions ?? [], hierarchy };
            }),
            currentOrganizationId: isUuid ? storedOrgId : null,
          } as UserContextResponse;
        }
      } catch {
        // Ignore parse errors
      }
      // Return undefined so TanStack Query fetches fresh data immediately
      return undefined;
    },
  });

  /**
   * Returns true if the current user has the given permission in their current
   * organization. Permission format: "resource:action" (e.g. "user_management:read").
   * System admins always return true.
   */
  function hasPermission(permission: string): boolean {
    const ctx = query.data;
    if (!ctx) return false;
    if (ctx.isSystemAdmin) return true;
    const orgId = ctx.currentOrganizationId;
    const org = orgId ? ctx.organizations.find((o) => o.id === orgId) : ctx.organizations[0];
    return org?.permissions?.includes(permission) ?? false;
  }

  /**
   * Returns true if the user has at least one of the given permissions.
   */
  function hasAnyPermission(permissions: string[]): boolean {
    return permissions.some((p) => hasPermission(p));
  }

  /**
   * Returns true if the member's role matches one of the provided role names.
   * Comparison is case-insensitive.
   */
  function hasRole(roleNames: string[]): boolean {
    const ctx = query.data;
    if (!ctx) return false;
    if (ctx.isSystemAdmin) return true;
    const orgId = ctx.currentOrganizationId;
    const org = orgId ? ctx.organizations.find((o) => o.id === orgId) : ctx.organizations[0];
    const memberRole = org?.hierarchy?.member?.role?.toLowerCase() ?? "";
    return roleNames.some((r) => r.toLowerCase() === memberRole);
  }

  return { ...query, hasPermission, hasAnyPermission, hasRole };
}












