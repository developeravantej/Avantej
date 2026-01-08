import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";

export interface UserContextResponse {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
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

// Mock data for development (when API is not available)
const MOCK_USER_CONTEXT: UserContextResponse = {
  user: {
    id: "mock-user-1",
    email: "demo@avantej.com",
    name: "Demo User",
    emailVerified: true,
  },
  organizations: [
    {
      id: "org-1",
      name: "Demo Franchise",
      slug: "demo-franchise",
      role: "Organization Owner",
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
  currentOrganizationId: "org-1",
};

export function useUserContext(enabled = true) {
  return useQuery<UserContextResponse>({
    queryKey: ["user-context"],
    queryFn: async () => {
      try {
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
      } catch (error) {
        console.warn("Failed to fetch user context from API, using mock data:", error);
        // Return mock data when API is not available
        return MOCK_USER_CONTEXT;
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - data doesn't change often
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    retry: 1,
    // Use localStorage as initial data if available, otherwise use mock data
    initialData: () => {
      try {
        const storedOrgs = localStorage.getItem("user_organizations");
        const storedOrgId = localStorage.getItem("current_organization_id");
        if (storedOrgs && storedOrgId) {
          const orgs = JSON.parse(storedOrgs);
          return {
            user: {
              id: "",
              email: "",
              name: "",
              emailVerified: false,
            },
            organizations: orgs.map((org: { id: string; name: string; slug: string; role: string }) => ({
              ...org,
              hierarchy: { nodes: [], member: null },
            })),
            currentOrganizationId: storedOrgId,
          } as UserContextResponse;
        }
      } catch {
        // Ignore parse errors
      }
      // Return mock data as fallback
      return MOCK_USER_CONTEXT;
    },
  });
}












