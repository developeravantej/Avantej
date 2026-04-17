import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import DataTable from "@/components/tables/payment/view/data-table";
import { columns, type PaymentRow } from "@/components/tables/payment/view/columns";
import { CreditCard } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/payment/view"
)({
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { data: apiData = [], isLoading, isError, error, refetch } = useQuery({
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

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-12">
				<p className="text-lg font-medium text-destructive">Failed to load data</p>
				<p className="text-sm text-muted-foreground mb-4">
					{error instanceof Error ? error.message : "An unexpected error occurred"}
				</p>
				<Button variant="outline" onClick={() => refetch()}>
					Try Again
				</Button>
			</div>
		);
	}

	return (
		<div className="p-6 space-y-6">
			<div className="flex items-center gap-3">
				<div className="p-2 rounded-lg bg-primary/10">
					<CreditCard className="h-6 w-6 text-primary" />
				</div>
				<div>
					<h1 className="text-2xl font-bold font-heading">Payments</h1>
					<p className="text-brand-secondary-1 text-sm">View and manage invoice payments.</p>
				</div>
			</div>
			<Separator />
			<DataTable<PaymentRow, unknown> columns={columns} data={data} />
		</div>
	);
}
