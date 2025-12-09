import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import apiClient from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import DataTable from "@/components/tables/branch/view/data-table";
import { columns } from "@/components/tables/branch/view/columns";

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

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      // Wait for auth to complete
      if (authLoading) return;

      // Check if user is authenticated
      if (!isAuthenticated) {
        return; // useAuth will handle redirect to login
      }

      // Load the data
      try {
        setIsLoading(true);
        
        // Load branches from API (automatically filtered by user's organization)
        const response = await apiClient.getListbranches();
        
        // Transform the data to match the expected format
        const transformedData = {
          items: response.data.map((branch: any) => ({
            id: branch.id,
            name: branch.name,
            code: branch.code,
            area_id: branch.area_id,
            organization_id: branch.organization_id,
            branch_type: branch.branch_type || "standard",
            is_active: branch.is_active,
            created_at: branch.created_at,
            updated_at: branch.updated_at,
          }))
        };

        setData(transformedData);
      } catch (error: any) {
        console.error("Failed to load branch data:", error);
        // Show user-friendly error message
        if (error.message.includes("Not authenticated")) {
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
  }, [user, authLoading, isAuthenticated, navigate]);

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
