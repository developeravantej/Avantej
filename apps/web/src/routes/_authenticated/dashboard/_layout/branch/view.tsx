import { columns } from "@/components/tables/branch/view/columns";
import DataTable from "@/components/tables/branch/view/data-table";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/branch/view"
)({
  component: RouteComponent,
});

function RouteComponent() {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { data: userContext, isLoading: isLoadingContext } = useUserContext();
  const navigate = useNavigate();
  const orgErrorShown = useRef(false);

  // Get organizationId from React Query data (single source of truth)
  const organizationId = userContext?.currentOrganizationId || 
                         user?.current_organization_id || 
                         user?.organizations?.[0]?.id || 
                         null;

  // Use React Query for branch data
  const { data: branchData, isLoading: isLoadingBranches, error } = useQuery({
    queryKey: ["branches", organizationId],
    queryFn: async () => {
      if (!organizationId) return { items: [] };
      
      // Try cached hierarchy first
      const cachedHierarchy = localStorage.getItem(`org_${organizationId}_hierarchy`);
      if (cachedHierarchy) {
        try {
          const hierarchy = JSON.parse(cachedHierarchy);
          const branchNodes = hierarchy.nodes.filter(
            (node: { type: string; depth: number }) =>
              node.type === "branch" && node.depth === 4
          );
          return {
            items: branchNodes.map((branch: any) => ({
              id: branch.id,
              name: branch.name,
              code: branch.code || "",
              area_id: branch.parentId,
              organization_id: organizationId,
              branch_type: "standard",
              is_active: true,
              created_at: branch.createdAt,
              updated_at: branch.updatedAt,
            })),
          };
        } catch (e) {
          console.warn('Failed to parse cached hierarchy, fetching from API:', e);
        }
      }

      // Fallback to API
      const result = await client.hierarchy.listNodes({ organizationId });
      return {
        items: result.nodes
          .filter((node: any) => node.type === "branch" && node.depth === 4)
          .map((branch: any) => ({
            id: branch.id,
            name: branch.name,
            code: branch.code || "",
            area_id: branch.parentId,
            organization_id: organizationId,
            branch_type: "standard",
            is_active: true,
            created_at: branch.createdAt,
            updated_at: branch.updatedAt,
          })),
      };
    },
    enabled: !!organizationId && isAuthenticated,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 1,
  });

  // Show error only once when we're sure there's no organization (after loading completes)
  useEffect(() => {
    if (!organizationId && !isLoadingContext && !authLoading && !orgErrorShown.current) {
      orgErrorShown.current = true;
      toast.error("No organization selected. Please ensure you have access to an organization.");
    } else if (organizationId) {
      // Reset flag if organization becomes available
      orgErrorShown.current = false;
    }
  }, [organizationId, isLoadingContext, authLoading]);

  // Handle API errors
  useEffect(() => {
    if (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes("UNAUTHORIZED") || errorMessage.includes("Not authenticated")) {
        toast.error("Please log in to access this page");
        navigate({ to: "/login" });
      } else {
        toast.error(`Failed to load branches: ${errorMessage}`);
      }
    }
  }, [error, navigate]);

  // NOW we can do conditional returns - all hooks have been called
  // Show loading state properly
  if (authLoading || isLoadingContext || isLoadingBranches) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (useAuth will handle redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Branches</h1>
          <p className="text-gray-600">Manage your organization's branches</p>
        </div>
        <Link to="/dashboard/branch/create">
          <Button className="flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Create Branch</span>
          </Button>
        </Link>
      </div>

      <DataTable columns={columns} data={branchData?.items || []} />
    </div>
  );
}
