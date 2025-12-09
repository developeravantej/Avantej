import { columns } from "@/components/tables/branch/view/columns";
import DataTable from "@/components/tables/branch/view/data-table";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { client } from "@/utils/orpc";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
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

  // Get organization ID from user context
  const organizationId =
    user?.current_organization_id || user?.organizations?.[0]?.id;

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
        toast.error("No organization selected");
        setData({ items: [] });
        setIsLoading(false);
        return;
      }

      // Load the data
      try {
        setIsLoading(true);

        // Load hierarchy nodes from oRPC client (filtered to branches)
        const result = await client.hierarchy.listNodes({ organizationId });
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
            organization_id: organizationId,
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
          toast.error("Failed to load branches");
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
