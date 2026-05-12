import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import DataTable from "@/components/tables/user/view/data-table";
import { columns } from "@/components/tables/user/view/columns";
import { requirePermission } from "@/lib/route-guards";

/**
 * User View Route
 *
 * Displays a table of all users/employees with role and status information.
 * Requires: user_management:read permission
 */
export const Route = createFileRoute("/_authenticated/user/view")({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "user_management", action: "read" },
			"/dashboard"
		);
	},
	component: UserViewComponent,
});

function UserViewComponent() {
	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";

	const { data: membersData = [], isLoading } = useQuery({
		...orpc.members.list.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Users</h1>
			</div>
			{isLoading ? (
				<div className="flex items-center justify-center py-8 text-muted-foreground">
					Loading members…
				</div>
			) : (
				<DataTable columns={columns} data={membersData} />
			)}
		</div>
	);
}

