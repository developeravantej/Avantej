import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { orpc } from "@/utils/orpc";
import DataTable from "@/components/tables/service/view/data-table";
import { columns } from "@/components/tables/service/view/columns";
import { PageLoader } from "@/components/ui/loading-spinner";

export function ServicesPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: services = [], isLoading: servicesLoading } = useQuery({
		...orpc.services.list.queryOptions({ input: { organizationId: organizationId! } }),
		enabled: !!organizationId,
	});

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view services.
			</div>
		);
	}

	if (servicesLoading) {
		return <PageLoader />;
	}

	return (
		<div className="h-full overflow-hidden">
			<DataTable
				columns={columns}
				data={services}
				organizationId={organizationId}
				isLoading={servicesLoading}
			/>
		</div>
	);
}
