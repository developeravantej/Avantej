import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { History } from "lucide-react";
import {
	buildColumns,
	type PaymentRow,
} from "@/components/tables/payment/view/columns";
import DataTable from "@/components/tables/payment/view/data-table";
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
	beforeLoad: async () => {
		await requirePermission("payments:read");
	},
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

	const count = isLoading ? null : paymentsData.length;

	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex flex-col gap-5">
			{/* ── Page header ── */}
			<div className="flex items-end justify-between">
				<div>
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PAYMENT HISTORY
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Payment History
					</h1>
					<p className="mt-1 text-sm text-[#737373]">
						{count !== null ? `${count} invoice payment${count !== 1 ? "s" : ""}` : "View and manage invoice payments."}
					</p>
				</div>
			</div>

			{/* ── Table card ── */}
			<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
				{isLoading ? (
					<PageLoader />
				) : isError ? (
					<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
						<History className="h-8 w-8 mb-3 opacity-30" />
						<p className="text-sm font-medium text-[#0a0a0a]">Failed to load payments</p>
						<p className="text-xs mt-1">
							{error instanceof Error ? error.message : "An unexpected error occurred."}
						</p>
						<button
							type="button"
							onClick={() => refetch()}
							className="mt-4 inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition"
						>
							Try Again
						</button>
					</div>
				) : (
					<DataTable<PaymentRow, unknown>
						columns={columns}
						data={paymentsData}
						emptyTitle="No payments found"
						emptyDescription="Invoice payments will appear here once sales are recorded."
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
							<History className="h-4 w-4 text-[#737373]" />
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
