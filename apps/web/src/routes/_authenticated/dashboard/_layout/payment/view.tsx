import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, History } from "lucide-react";
import {
	buildColumns,
	type PaymentRow,
} from "@/components/tables/payment/view/columns";
import DataTable from "@/components/tables/payment/view/data-table";
import { Separator } from "@/components/ui/separator";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { useMemo, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { StatusTimeline } from "@/components/ui/status-timeline";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/payment/view",
)({
	component: RouteComponent,
});

function PaymentHistoryPanel({
	organizationId,
	paymentId,
}: {
	organizationId: string;
	paymentId: string;
}) {
	const { data, isLoading } = useQuery({
		queryKey: ["invoices", "paymentStatusHistory", paymentId],
		queryFn: () =>
			client.invoices.paymentStatusHistory({ organizationId, paymentId }),
	});
	return <StatusTimeline entries={data?.rows ?? []} isLoading={isLoading} />;
}

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

	const {
		data: invoicesApiData = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		queryKey: ["invoices", organizationId],
		queryFn: () => client.invoices.list({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const paymentsData: PaymentRow[] = invoicesApiData.map((item) => ({
		date: item.date ? item.date.toISOString() : null,
		invoice: item.invoiceNumber,
		sales_order: item.salesOrderId ?? null,
		payment_id: item.paymentId ?? null,
		mode: item.paymentMode ?? null,
		total_paid: item.totalAmount,
		customer_name: item.customerName,
		created_by: item.createdBy,
		e_invoice_status: item.eInvoiceStatus ?? null,
	}));

	const columns = useMemo(
		() => buildColumns((paymentId) => setSelectedPaymentId(paymentId)),
		[],
	);

	return (
		<div className="p-6 space-y-6">
			<div className="space-y-1">
				<div className="flex items-center gap-2">
					<CreditCard className="h-5 w-5 text-muted-foreground" />
					<h1 className="text-xl font-semibold">Payments</h1>
				</div>
				<p className="text-sm text-muted-foreground">
					View and manage invoice payments.
				</p>
			</div>
			<Separator />
			<div className="rounded-2xl border border-border/40 bg-white shadow-sm overflow-hidden">
				{isLoading ? (
					<PageLoader />
				) : (
					<DataTable<PaymentRow, unknown>
						columns={columns}
						data={paymentsData}
						emptyTitle="No payments found"
						emptyDescription="Invoice payments will appear here once sales are recorded."
						error={isError ? error : undefined}
						onRetry={refetch}
					/>
				)}
			</div>

			{/* ── Payment Status History Dialog ── */}
			<Dialog
				open={selectedPaymentId !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedPaymentId(null);
				}}
			>
				<DialogContent className="sm:max-w-md overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<History className="h-4 w-4 text-muted-foreground" />
							Payment Status History
						</DialogTitle>
						<DialogDescription>
							Status transitions for this payment.
						</DialogDescription>
					</DialogHeader>
					{selectedPaymentId && organizationId && (
						<PaymentHistoryPanel
							organizationId={organizationId}
							paymentId={selectedPaymentId}
						/>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
