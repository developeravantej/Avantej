import { createFileRoute } from "@tanstack/react-router";
import DataTable from "@/components/tables/service-category/view/data-table";
import { columns } from "@/components/tables/service-category/view/columns";
import { requirePermission } from "@/lib/route-guards";
import { useUserContext } from "@/hooks/useUserContext";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";

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
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const {
		data: categories = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["service-categories", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.serviceCategories.list({
				organizationId,
				isActive: undefined,
			});
		},
		enabled: !!organizationId,
		staleTime: 30 * 1000,
	});

	if (!organizationId) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-semibold">Service Categories</h1>
				<p className="text-muted-foreground">No organization selected. Please select an organization first.</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-semibold">Service Categories</h1>
				<p className="text-destructive">{error instanceof Error ? error.message : "Failed to load categories"}</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-semibold">Service Categories</h1>
			</div>
			<DataTable
				columns={columns}
				data={categories}
				{...({ organizationId, isLoading, onSuccess: refetch } as any)}
			/>
		</div>
	);
}
