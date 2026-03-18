import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/sales/view/data-table";
import { columns, type SalesRow } from "@/components/tables/sales/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/view"
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["salesOrders", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.salesOrders.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const data: SalesRow[] = apiData.map((item) => ({
		date: item.date ? item.date.toISOString() : null,
		sales_order: item.salesOrderNumber,
		total_sales: item.totalAmount,
		customer_name: item.customerName,
		created_by: item.createdBy,
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

	return (
		<DataTable<SalesRow, unknown> columns={columns} data={data} />
	);
}
