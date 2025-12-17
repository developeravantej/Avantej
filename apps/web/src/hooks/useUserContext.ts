import { useQuery } from "@tanstack/react-query";
import { getServerUrl } from "@/lib/config";

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

export function useUserContext(enabled = true) {
  return useQuery<UserContextResponse>({
    queryKey: ["user-context"],
    queryFn: async () => {
      const serverUrl = getServerUrl();
      const response = await fetch(`${serverUrl}/auth/user-context`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch user context");
      }

      const data = await response.json();
      
      // Persist to localStorage for offline/quick access
      if (data.organizations?.length > 0) {
        localStorage.setItem("user_organizations", JSON.stringify(
          data.organizations.map((org: UserContextResponse["organizations"][0]) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            role: org.role,
          }))
        ));
        localStorage.setItem("current_organization_id", data.currentOrganizationId || data.organizations[0].id);
        
        // Cache hierarchy data
        data.organizations.forEach((org: UserContextResponse["organizations"][0]) => {
          if (org.hierarchy?.nodes) {
            localStorage.setItem(`org_${org.id}_hierarchy`, JSON.stringify(org.hierarchy));
          }
        });
      }

      return data;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - data doesn't change often
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    retry: 1,
    // Use localStorage as initial data if available
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
      return undefined;
    },
  });
}









