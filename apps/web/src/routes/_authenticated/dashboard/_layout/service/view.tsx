import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/service/view/data-table";
import { columns } from "@/components/tables/service/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/service/view",
)({
	component: ServiceViewPage,
});

function ServiceViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const { data: services = [], isLoading: servicesLoading } = useQuery({
		queryKey: ["services", organizationId],
		queryFn: () => client.services.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const { data: categories = [], isLoading: categoriesLoading } = useQuery({
		queryKey: ["serviceCategories", organizationId],
		queryFn: () =>
			client.serviceCategories.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const isLoading = servicesLoading || categoriesLoading;

	function handleSuccess() {
		queryClient.invalidateQueries({ queryKey: ["services", organizationId] });
	}

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view services.
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
				<h1 className="text-2xl font-bold">Services</h1>
				<p className="text-sm text-muted-foreground">
					Manage services offered by your organization
				</p>
			</div>
			<DataTable
				columns={columns}
				data={services}
				organizationId={organizationId}
				categories={categories.map((c) => ({ id: c.id, name: c.name }))}
				isLoading={isLoading}
				onSuccess={handleSuccess}
			/>
		</div>
	);
}
