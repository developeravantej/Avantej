import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/service-category/view/data-table";
import { columns } from "@/components/tables/service-category/view/columns";

export function ServiceCategoriesPage() {
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
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view service categories.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex min-h-96 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-r-transparent">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full overflow-hidden">
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
