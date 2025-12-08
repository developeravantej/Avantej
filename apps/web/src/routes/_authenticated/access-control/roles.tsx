import { createFileRoute } from "@tanstack/react-router";
import DataTable from "@/components/tables/role/view/data-table";
import { columns } from "@/components/tables/role/view/columns";
import { requirePermission } from "@/lib/route-guards";

/**
 * Role Management Route
 * 
 * Displays a table of all roles with permission management capabilities.
 * Requires: role_management:read permission
 */
export const Route = createFileRoute("/_authenticated/access-control/roles")({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "role_management", action: "read" },
			"/dashboard"
		);
	},
	component: RolesComponent,
});

function RolesComponent() {
	// TODO: Replace with actual API call when backend is ready
	// const { data: roles } = useQuery(apiClient.getListroles.queryOptions());
	
	// Mock data for UI development - matches Role type from columns.tsx
	const mockRoles = [
		{
			id: "1",
			name: "System Admin",
			description: "Full system access",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: "2",
			name: "Manager",
			description: "Management access",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: "3",
			name: "Trainer",
			description: "Trainer access",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Role Management</h1>
			</div>
			<DataTable columns={columns} data={mockRoles} />
		</div>
	);
}

