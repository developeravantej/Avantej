import { createFileRoute } from "@tanstack/react-router";
import DataTable from "@/components/tables/service-category/view/data-table";
import { columns } from "@/components/tables/service-category/view/columns";
import { requirePermission } from "@/lib/route-guards";

/**
 * Service Category View Route
 * 
 * Displays a table of all service categories with CRUD operations.
 * Requires: service_management:read permission
 */
export const Route = createFileRoute("/_authenticated/service-category/view")({
	beforeLoad: async () => {
		await requirePermission(
			{ resource: "service_management", action: "read" },
			"/dashboard"
		);
	},
	component: ServiceCategoryViewComponent,
});

function ServiceCategoryViewComponent() {
	// TODO: Replace with actual API call when backend is ready
	// const { data: categories } = useQuery(apiClient.getListServiceCategories.queryOptions());
	
	// Mock data for UI development
	const mockCategories = [
		{
			id: "1",
			name: "Fitness Training",
			description: "Personal training and fitness services",
			service_count: 5,
		},
		{
			id: "2",
			name: "Wellness",
			description: "Spa and wellness treatments",
			service_count: 8,
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold">Service Categories</h1>
			</div>
			<DataTable columns={columns} data={mockCategories} />
		</div>
	);
}

