import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { DataTable } from "@/components/tables/stock-requests/view/data-table";
import { columns, type StockRequestRow } from "@/components/tables/stock-requests/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/stock-requests/view"
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["stockRequests", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.stockRequests.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const data: StockRequestRow[] = apiData.map((item) => ({
		"Request Number": item.requestNumber,
		"Date Issued": item.dateIssued ? item.dateIssued.toISOString() : "",
		"Issued By": item.issuedByMemberId,
		"Issued To": item.destinationLabel ?? item.toBranchId,
		Status: item.status,
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
