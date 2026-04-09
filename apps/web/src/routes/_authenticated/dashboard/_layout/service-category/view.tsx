import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/service-category/view/data-table";
import { columns } from "@/components/tables/service-category/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/service-category/view",
)({
	component: ServiceCategoryViewPage,
});

function ServiceCategoryViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const { data: categories = [], isLoading } = useQuery({
		queryKey: ["serviceCategories", organizationId],
		queryFn: () =>
			client.serviceCategories.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	function handleSuccess() {
		queryClient.invalidateQueries({
			queryKey: ["serviceCategories", organizationId],
		});
	}

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view service categories.
			</div>
		);
	}

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
		<div className="p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-bold font-heading">Service Categories</h1>
				<p className="text-sm text-muted-foreground">
					Manage service categories for your organization
				</p>
			</div>
			<DataTable
				columns={columns}
				data={categories}
				organizationId={organizationId}
				isLoading={isLoading}
				onSuccess={handleSuccess}
			/>
		</div>
	);
}
