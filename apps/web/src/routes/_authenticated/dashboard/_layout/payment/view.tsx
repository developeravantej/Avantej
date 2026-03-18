import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import DataTable from "@/components/tables/payment/view/data-table";
import { columns, type PaymentRow } from "@/components/tables/payment/view/columns";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/payment/view"
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["invoices", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.invoices.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const data: PaymentRow[] = apiData.map((item) => ({
		date: item.date ? item.date.toISOString() : null,
		invoice: item.invoiceNumber,
		sales_order: item.salesOrderId ?? null,
		mode: item.paymentMode ?? null,
		total_paid: item.totalAmount,
		customer_name: item.customerName,
		created_by: item.createdBy,
		e_invoice_status: item.eInvoiceStatus ?? null,
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
		<DataTable<PaymentRow, unknown> columns={columns} data={data} />
	);
}
