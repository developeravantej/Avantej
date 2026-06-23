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
import { orpc } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { useMemo } from "react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/payment/view",
)({
	beforeLoad: async () => {
		await requirePermission("payments:read");
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const {
		data: invoicesApiData = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		...orpc.invoices.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const paymentsData: PaymentRow[] = invoicesApiData.map((item) => ({
		id: item.id,
		organization_id: organizationId,
		date: item.date ? new Date(item.date).toISOString() : null,
		invoice: item.invoiceNumber,
		sales_order: item.salesOrderId ?? null,
		payment_id: item.paymentId ?? null,
		mode: item.paymentMode ?? null,
		total_paid: item.totalAmount,
		customer_name: item.customerName,
		// DU-002: prefer resolved name over raw UUID; fall back through UUID then em-dash
		created_by:
			(item as typeof item & { createdByName?: string | null }).createdByName ??
			item.createdBy ??
			"—",
		e_invoice_status: item.eInvoiceStatus ?? null,
	}));

	const columns = useMemo(() => buildColumns(), []);

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Finance</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Payments</span>
				</div>
			</header>
			<div className="flex flex-col gap-5 px-6 py-6">
				{/* ── Table card ── */}
				<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
					{isLoading ? (
						<PageLoader />
					) : isError ? (
						<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
							<History className="h-8 w-8 mb-3 opacity-30" />
							<p className="text-sm font-medium text-[#0a0a0a]">
								Failed to load payments
							</p>
							<p className="text-xs mt-1">
								{error instanceof Error
									? error.message
									: "An unexpected error occurred."}
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
			</div>
		</div>
	);
}
