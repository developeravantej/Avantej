import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import DataTable from "@/components/tables/role/view/data-table";
import { columns } from "@/components/tables/role/view/columns";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/role/view"
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

      // Check if user has organization_id
      console.log("Current user: ", user);
      const organization_id = user?.current_organization_id || user?.organizations?.[0]?.id;
      if (!organization_id) {
        toast.warning("You are not authorized to access this page");
        navigate({ to: "/dashboard" });
        return;
      }

      // Load the data
      try {
        setIsLoading(true);
        // TODO: Implement actual API call when backend is ready
        // Simulating data fetch
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Mock data for UI display
        const mockData = [
          { 
            id: "1", 
            name: "Admin", 
            description: "Full system administrator with all permissions",
            created_at: "2024-01-01T08:00:00Z",
            updated_at: "2024-01-01T08:00:00Z"
          },
          { 
            id: "2", 
            name: "Manager", 
            description: "Can manage users and view reports",
            created_at: "2024-01-05T10:30:00Z",
            updated_at: "2024-01-05T10:30:00Z"
          },
          { 
            id: "3", 
            name: "User", 
            description: "Basic user with read-only access",
            created_at: "2024-01-10T14:20:00Z",
            updated_at: "2024-01-10T14:20:00Z"
          },
          { 
            id: "4", 
            name: "Supervisor", 
            description: "Can supervise team activities and approve requests",
            created_at: "2024-02-15T09:45:00Z",
            updated_at: "2024-02-15T09:45:00Z"
          },
        ];
        
        setData(mockData);
      } catch (error) {
        console.error("Failed to load role data:", error);
        toast.error("Failed to load data");
        navigate({ to: "/dashboard" });
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
        <h1 className="text-3xl font-bold">User Roles</h1>
      </div>
      <DataTable columns={columns} data={data || []} />
    </div>
  );
}
