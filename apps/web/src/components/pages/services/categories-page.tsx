import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import DataTable from "@/components/tables/service-category/view/data-table";
import { columns } from "@/components/tables/service-category/view/columns";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";

export function ServiceCategoriesPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: categories = [], isLoading, isError, refetch } = useQuery({
		queryKey: orpc.serviceCategories.list.key({
			input: { organizationId: organizationId! },
		}),
		queryFn: () =>
			client.serviceCategories.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view service categories.
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex min-h-96 items-center justify-center">
				<div className="text-center">
					<p className="text-sm text-red-600 mb-2">Failed to load service categories.</p>
					<button type="button" onClick={() => refetch()} className="text-sm text-[#0a0a0a] underline">Retry</button>
				</div>
			</div>
		);
	}

	return (
		<Skeleton name="services-categories-page" loading={isLoading} fallback={<PageLoader />}>
		<div className="h-full overflow-hidden">
			<DataTable
				columns={columns}
				data={categories}
				organizationId={organizationId}
				isLoading={isLoading}
			/>
		</div>
		</Skeleton>
	);
}
