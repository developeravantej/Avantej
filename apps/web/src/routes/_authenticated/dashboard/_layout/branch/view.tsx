import { columns } from "@/components/tables/branch/view/columns";
import DataTable from "@/components/tables/branch/view/data-table";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { client } from "@/utils/orpc";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/branch/view"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [orgCheckPending, setOrgCheckPending] = useState(false);
  const orgWarningShown = useRef(false);

  // Get organization ID from user context or localStorage
  // Priority: user.current_organization_id > user.organizations[0].id > localStorage
  useEffect(() => {
    // First try from user object
    if (user?.current_organization_id) {
      setOrganizationId(user.current_organization_id);
      return;
    }
    if (user?.organizations?.[0]?.id) {
      setOrganizationId(user.organizations[0].id);
      return;
    }
    
    // Fallback to localStorage if user object doesn't have it yet
    try {
      const storedOrgId = localStorage.getItem('current_organization_id');
      if (storedOrgId) {
        setOrganizationId(storedOrgId);
      }
    } catch (error) {
      console.error('Failed to read organization ID from localStorage:', error);
    }
  }, [user]);

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      // Wait for auth to complete
      if (authLoading) return;

      // Check if user is authenticated
      if (!isAuthenticated) {
        return; // useAuth will handle redirect to login
      }

      // Check if organization ID is available
      if (!organizationId) {
        // Avoid immediate toast; try localStorage once more and show loading briefly
        if (!orgCheckPending) {
          setOrgCheckPending(true);
          // Grace period to allow useAuth to populate organizationId
          setTimeout(() => {
            const storedOrgId = localStorage.getItem('current_organization_id');
            if (storedOrgId) {
              setOrganizationId(storedOrgId);
            } else if (!orgWarningShown.current) {
              orgWarningShown.current = true;
              toast.error("No organization selected. Please ensure you have access to an organization.");
              setData({ items: [] });
              setIsLoading(false);
            }
            setOrgCheckPending(false);
          }, 1200);
        }
        return;
      }

      // Load the data
      await loadBranchData(organizationId);
    };

    const loadBranchData = async (orgId: string) => {
      try {
        setIsLoading(true);

        // Try to use cached hierarchy data first (from user-context endpoint)
        const cachedHierarchy = localStorage.getItem(`org_${orgId}_hierarchy`);
        if (cachedHierarchy) {
          try {
            const hierarchy = JSON.parse(cachedHierarchy);
            const branchNodes = hierarchy.nodes.filter(
              (node: { type: string; depth: number }) =>
                node.type === "branch" && node.depth === 4
            );
            
            const transformedData = {
              items: branchNodes.map((branch: any) => ({
                id: branch.id,
                name: branch.name,
                code: branch.code || "",
                area_id: branch.parentId,
                organization_id: orgId,
                branch_type: "standard",
                is_active: true,
                created_at: branch.createdAt,
                updated_at: branch.updatedAt,
              })),
            };
            
            setData(transformedData);
            setIsLoading(false);
            return; // Use cached data, skip API call
          } catch (e) {
            console.warn('Failed to parse cached hierarchy, fetching from API:', e);
          }
        }

        // Fallback to API call if no cached data
        const result = await client.hierarchy.listNodes({ organizationId: orgId });
        const nodes = result.nodes;

        // Filter to only branch nodes (type === "branch", depth === 4)
        const branchNodes = nodes.filter(
          (node: { type: string; depth: number }) =>
            node.type === "branch" && node.depth === 4
        );

        // Transform the data to match the expected format
        const transformedData = {
          items: branchNodes.map((branch: any) => ({
            id: branch.id,
            name: branch.name,
            code: branch.code || "",
            area_id: branch.parentId,
            organization_id: orgId,
            branch_type: "standard", // Default, can be enhanced later
            is_active: true, // Default, can be enhanced later
            created_at: branch.createdAt,
            updated_at: branch.updatedAt,
          })),
        };

        setData(transformedData);
      } catch (error: any) {
        console.error("Failed to load branch data:", error);
        // Show user-friendly error message
        if (
          error.message?.includes("UNAUTHORIZED") ||
          error.message?.includes("Not authenticated")
        ) {
          toast.error("Please log in to access this page");
          navigate({ to: "/login" });
        } else {
          toast.error(`Failed to load branches: ${error.message || 'Unknown error'}`);
          // Still show the page with empty data rather than redirecting
          setData({ items: [] });
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthAndLoadData();
  }, [user, authLoading, isAuthenticated, organizationId, navigate]);

  // Show loading while auth is checking or data is loading
  if (authLoading || isLoading) {
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

      <DataTable columns={columns} data={data?.items || []} />
    </div>
  );
}
