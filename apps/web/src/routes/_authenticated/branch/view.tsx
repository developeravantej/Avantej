import { createFileRoute } from "@tanstack/react-router";
import DataTable from "@/components/tables/branch/view/data-table";
import { columns } from "@/components/tables/branch/view/columns";
import { requirePermission } from "@/lib/route-guards";

/**
 * Branch View Route
 * 
 * Displays a table of all branches with filtering and sorting capabilities.
 * Requires: hierarchy_management:read permission
 */
export const Route = createFileRoute("/_authenticated/branch/view")({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "hierarchy_management", action: "read" },
			"/dashboard"
		);
	},
	component: BranchViewComponent,
});

function BranchViewComponent() {
	// TODO: Replace with actual API call when backend is ready
	// const { data: branches } = useQuery(apiClient.getListbranches.queryOptions());
	
	// Mock data for UI development
	const mockBranches = [
		{
			name: "Main Branch",
			person_in_charge: {
				name: "John Doe",
				email: "john@example.com",
			},
			area: {
				name: "Downtown Area",
				region: {
					name: "Central Region",
					country: {
						name: "Malaysia",
					},
				},
			},
			location: {
				address: "123 Main Street",
			},
		},
		{
			name: "Suburban Branch",
			person_in_charge: {
				name: "Jane Smith",
				email: "jane@example.com",
			},
			area: {
				name: "Suburban Area",
				region: {
					name: "Northern Region",
					country: {
						name: "Malaysia",
					},
				},
			},
			location: {
				address: "456 Oak Avenue",
			},
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Branches</h1>
			</div>
			<DataTable columns={columns} data={mockBranches} />
		</div>
	);
}

