import { createFileRoute } from "@tanstack/react-router";
import DataTable from "@/components/tables/service/view/data-table";
import { columns } from "@/components/tables/service/view/columns";
import { requirePermission } from "@/lib/route-guards";

/**
 * Service View Route
 * 
 * Displays a table of all services with filtering by scheduling type and recurring days.
 * Requires: service_management:read permission
 */
export const Route = createFileRoute("/_authenticated/service/view")({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "service_management", action: "read" },
			"/dashboard"
		);
	},
	component: ServiceViewComponent,
});

function ServiceViewComponent() {
	// TODO: Replace with actual API call when backend is ready
	// const { data: services } = useQuery(apiClient.getListServices.queryOptions());
	
	// Mock data for UI development
	const mockServices = [
		{
			id: "1",
			name: "Personal Training Session",
			category: "Fitness Training",
			duration: 60,
			duration_unit: "minutes",
			price: "100.00",
			scheduling_type: "appointment-based",
		},
		{
			id: "2",
			name: "Group Fitness Class",
			category: "Fitness Training",
			duration: 45,
			duration_unit: "minutes",
			price: "25.00",
			scheduling_type: "recurring",
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Services</h1>
			</div>
			<DataTable columns={columns} data={mockServices} />
		</div>
	);
}

