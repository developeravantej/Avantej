import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import DataTable from "@/components/tables/role/view/data-table";
import { columns } from "@/components/tables/role/view/columns";

export const Route = createFileRoute(
  "/_authenticated/dashboard/_layout/role/view"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: userCtx } = useUserContext();
  const organizationId = userCtx?.currentOrganizationId ?? "";

  const { data = [], isLoading } = useQuery({
    ...orpc.roles.list.queryOptions({ input: { organizationId } }),
    enabled: !!organizationId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">User Roles</h1>
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  );
}
