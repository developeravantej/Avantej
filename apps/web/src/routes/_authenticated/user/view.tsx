import { createFileRoute } from "@tanstack/react-router";
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
	// TODO: Replace with actual API call when backend is ready
	// const { data: users } = useQuery(apiClient.getListusers.queryOptions());
	
	// Mock data for UI development - matches User type from columns.tsx
	const mockUsers = [
		{
			id: "1",
			name: "John Doe",
			email: "john@example.com",
			email_verified: true,
			onboarding_completed: true,
			image: null,
			organization_id: "org-1",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		{
			id: "2",
			name: "Jane Smith",
			email: "jane@example.com",
			email_verified: true,
			onboarding_completed: true,
			image: null,
			organization_id: "org-1",
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Users</h1>
			</div>
			<DataTable columns={columns} data={mockUsers} />
		</div>
	);
}

