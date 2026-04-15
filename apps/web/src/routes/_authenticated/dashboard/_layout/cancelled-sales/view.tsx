import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/cancelled-sales/view/data-table";
import { columns, type CancelledSaleRow } from "@/components/tables/cancelled-sales/view/columns";

type CancelledSaleApiItem = Awaited<ReturnType<typeof client.cancelledSales.list>>[number];

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/cancelled-sales/view"
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["cancelledSales", organizationId],
		queryFn: (): Promise<Awaited<ReturnType<typeof client.cancelledSales.list>>> => {
			if (!organizationId) return Promise.resolve([]);
			return client.cancelledSales.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const data: CancelledSaleRow[] = (apiData as CancelledSaleApiItem[]).map((item) => ({
		date: item.cancellationDate
			? (typeof item.cancellationDate === "string" ? item.cancellationDate : item.cancellationDate.toISOString())
			: null,
		cancellation: item.cancellationNumber,
		sales_order: item.salesOrderId,
		cancelled_amount: item.cancelledAmount,
		customer_name: item.customerName,
		created_by: item.cancelledBy,
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
		<DataTable<CancelledSaleRow, unknown> columns={columns} data={data} />
	);
}
