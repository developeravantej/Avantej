import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { DataTable } from "@/components/tables/uom/view/data-table";
import { columns, type UoMRow } from "@/components/tables/uom/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/uom/view"
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["unitsOfMeasure", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.unitsOfMeasure.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const data: UoMRow[] = apiData.map((item) => ({
		id: item.id,
		Name: item.name,
		Description: item.description ?? "",
		"Base UoM": item.baseUomId ?? undefined,
	}));

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	return <DataTable columns={columns} data={data} />;
}
