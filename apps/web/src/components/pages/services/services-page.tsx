import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/service/view/data-table";
import { columns } from "@/components/tables/service/view/columns";

export function ServicesPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const { data: services = [], isLoading: servicesLoading } = useQuery({
		queryKey: ["services", organizationId],
		queryFn: () => client.services.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const isLoading = servicesLoading;

	function handleSuccess() {
		queryClient.invalidateQueries({ queryKey: ["services", organizationId] });
	}

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view services.
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
				data={services}
				organizationId={organizationId}
				isLoading={isLoading}
				onSuccess={handleSuccess}
			/>
		</div>
	);
}
