import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import {
	ChevronLeft,
	Copy,
	ExternalLink,
	Printer,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PartialRefundDialog } from "@/components/refunds/partial-refund-dialog";
import { RequestRefundDialog } from "@/components/refunds/request-refund-dialog";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";
import { SalesStatusBadge } from "@/components/pages/sales/SalesStatusBadge";
import { StatusHistoryCard } from "@/components/pages/sales/StatusHistoryCard";
import { CancelSaleDialog } from "@/components/pages/sales/CancelSaleDialog";
import { mapReceiptResponse } from "@/components/pages/sales/map-receipt";
import { PrintReceiptDialog } from "@/components/pages/sales/PrintReceiptDialog";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/$id",
)({
	beforeLoad: async () => {
		await requirePermission("sales:read");
	},
	component: SalesOrderDetailPage,
});

function SalesOrderDetailPage() {
	const { id } = Route.useParams();
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const navigate = useNavigate();
	const [printDialogOpen, setPrintDialogOpen] = useState(false);
	const [refundDialogOpen, setRefundDialogOpen] = useState(false);
	const [partialRefundDialogOpen, setPartialRefundDialogOpen] = useState(false);
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
	const canRequestRefund = hasPermission("refund_management:create");
	const canCancelSale = hasPermission("sales:delete");

	const {
		data: order,
		isLoading: orderLoading,
		error: orderError,
	} = useQuery({
		...orpc.salesOrders.getById.queryOptions({
			input: { organizationId: organizationId!, id },
		}),
		enabled: !!organizationId,
	});

	const { data: invoices = [] } = useQuery({
		...orpc.invoices.list.queryOptions({
			input: { organizationId: organizationId!, salesOrderId: id },
		}),
		enabled: !!organizationId,
	});

	const { data: lineItemsData } = useQuery({
		...orpc.pos.getReceiptData.queryOptions({
			input: { organizationId: organizationId!, salesOrderId: id },
		}),
		enabled: !!organizationId,
		retry: 1,
	});

	const lineItems = lineItemsData?.items ?? [];

	// Online (Stripe) sale awaiting payment: resurface the Payment Link so the
	// cashier can copy/send it. Hidden once the webhook flips payment→succeeded,
	// and for cancelled orders (the link is deactivated on cancel).
	const pendingPayment = lineItemsData?.payment;
	const pendingPaymentLinkUrl =
		pendingPayment?.paymentLinkUrl &&
		pendingPayment.status !== "succeeded" &&
		order?.status !== "cancelled"
			? pendingPayment.paymentLinkUrl
			: null;

	// Edge case: the customer paid the Stripe link AFTER the sale was cancelled.
	// The webhook records the money but never resurrects the order — staff must
	// refund manually, so shout about it here (admins also get a notification).
	const refundRequired =
		order?.status === "cancelled" && pendingPayment?.status === "succeeded";

	const {
		data: receiptDataRaw,
		isLoading: receiptLoading,
		isError: receiptError,
		refetch: refetchReceipt,
	} = useQuery({
		...orpc.pos.getReceiptData.queryOptions({
			input: { organizationId: organizationId!, salesOrderId: id },
		}),
		enabled: !!organizationId && printDialogOpen,
		retry: 1,
	});

	if (orderError || !order) {
		return (
			<div
				className="-m-6 min-h-screen bg-[#f3f3f3] p-6"
				data-testid="pos-sale-success-screen"
			>
				<Link
					to="/dashboard/sales/view"
					className="mb-4 inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-[#737373] hover:text-[#0a0a0a] transition-colors"
				>
					<ChevronLeft className="h-3 w-3" />
					Sales
				</Link>
				<div className="mt-4">
					<StatusCallout
						variant="error"
						title="Order not found"
						message={
							orderError instanceof Error
								? orderError.message
								: "This order could not be loaded."
						}
					/>
				</div>
			</div>
		);
	}

	return (
		<Skeleton
			name="sales-detail"
			loading={orderLoading}
			fallback={<PageLoader />}
		>
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
				<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
					<div className="flex items-center gap-3 text-sm">
						<Link
							to="/dashboard/sales/view"
							className="text-[#737373] hover:text-[#0a0a0a] transition-colors"
						>
							Sales
						</Link>
						<span className="text-[#a3a3a3]">/</span>
						<span className="font-semibold" data-testid="pos-sale-success-id">
							{order.salesOrderNumber}
						</span>
					</div>
					<div className="ml-auto flex items-center gap-2">
						{canCancelSale &&
							(order.status === "confirmed" ||
								order.status === "completed") && (
								<button
									type="button"
									className="flex items-center gap-2 rounded-lg bg-red-600 text-white px-4 py-2 text-xs font-semibold transition hover:bg-red-700"
									onClick={() => setCancelDialogOpen(true)}
									data-testid="cancel-sale-button"
								>
									<XCircle className="h-4 w-4" />
									Cancel Sale
								</button>
							)}
						{canRequestRefund && (
							<button
								type="button"
								className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3]"
								onClick={() => setRefundDialogOpen(true)}
							>
								Request Refund
							</button>
						)}
						{canRequestRefund && (
							<button
								type="button"
								className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3]"
								onClick={() => setPartialRefundDialogOpen(true)}
							>
								Partial Refund
							</button>
						)}
						<button
							type="button"
							className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3]"
							onClick={() => setPrintDialogOpen(true)}
							data-testid="print-receipt-button"
						>
							<Printer className="h-4 w-4" />
							Print Receipt
						</button>
					</div>
				</header>
				<div className="px-6 py-6">
					{/* ── Sections (single-column scroll, Section 12.2) ── */}
					<div className="space-y-5">
						{/* Refund required — Stripe payment landed on a cancelled sale */}
						{refundRequired && (
							<div data-testid="refund-required-callout">
								<StatusCallout
									variant="error"
									title="Refund required"
									message={`A Stripe payment of ${formatPrice(pendingPayment?.totalAmount ?? 0, "MYR")} was received after this sale was cancelled. The order remains cancelled — issue a refund to the customer.`}
								/>
							</div>
						)}

						{/* Payment Link — online sale awaiting customer payment */}
						{pendingPaymentLinkUrl && (
							<div
								data-testid="pos-payment-link"
								className="rounded-2xl border border-[#0a0a0a]/15 bg-white p-5"
							>
								<div className="mb-3 flex items-center justify-between">
									<h2 className="text-base font-bold text-[#0a0a0a]">
										Payment Link
									</h2>
									<SalesStatusBadge status="pending" />
								</div>
								<p className="mb-3 text-sm text-[#737373]">
									Awaiting online payment — send this link to the customer to
									complete the sale.
								</p>
								<code className="block w-full truncate rounded-lg bg-[#f3f3f3] px-3 py-2 text-xs text-[#0a0a0a]">
									{pendingPaymentLinkUrl}
								</code>
								<div className="mt-3 flex gap-2">
									<button
										type="button"
										className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3]"
										onClick={() => {
											navigator.clipboard.writeText(pendingPaymentLinkUrl);
											toast.success("Payment link copied");
										}}
									>
										<Copy className="h-4 w-4" />
										Copy link
									</button>
									<a
										href={pendingPaymentLinkUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3]"
									>
										<ExternalLink className="h-4 w-4" />
										Open
									</a>
								</div>
							</div>
						)}

						{/* Order Summary */}
						<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
							<div className="mb-4 flex items-center justify-between">
								<h2 className="text-base font-bold text-[#0a0a0a]">
									Order Summary
								</h2>
							</div>
							<dl className="grid grid-cols-[160px_1fr] gap-y-3 text-sm">
								<dt className="text-[#737373]">Total Amount</dt>
								<dd className="font-mono tabular-nums text-[#0a0a0a]">
									{formatPrice(order.totalAmount ?? 0, "MYR")}
								</dd>

								<dt className="text-[#737373]">Customer</dt>
								<dd className="text-[#0a0a0a]">{order.customerName ?? "—"}</dd>

								<dt className="text-[#737373]">Created By</dt>
								<dd className="text-[#0a0a0a]">
									{order.createdByName ?? order.createdBy ?? "—"}
								</dd>

								<dt className="text-[#737373]">Customer Type</dt>
								<dd className="text-[#0a0a0a]">{order.customerType ?? "—"}</dd>

								{(order.cancelledAmount ?? 0) > 0 && (
									<>
										<dt className="text-[#737373]">Legacy Refund</dt>
										<dd className="font-mono tabular-nums text-amber-700">
											{formatPrice(order.cancelledAmount ?? 0, "MYR")}
										</dd>
									</>
								)}

								{order.notes && (
									<>
										<dt className="text-[#737373]">Notes</dt>
										<dd className="text-[#404040]">{order.notes}</dd>
									</>
								)}
							</dl>
						</div>

						{/* Line Items */}
						{lineItems.length > 0 && (
							<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
								<div className="border-b border-[#e5e5e5] px-5 py-4">
									<h2 className="text-base font-bold text-[#0a0a0a]">
										Line Items
									</h2>
								</div>
								<table className="w-full">
									<thead className="bg-[#f3f3f3]">
										<tr className="border-b border-[#e5e5e5]">
											<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Description
											</th>
											<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Qty
											</th>
											<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Unit Price
											</th>
											<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Total
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[#e5e5e5]">
										{lineItems.map((it, idx) => (
											<tr key={idx} className="hover:bg-[#fafafa]">
												<td className="px-4 py-3 text-sm text-[#0a0a0a]">
													{it.description ?? it.serviceName ?? "Item"}
												</td>
												<td className="px-4 py-3 text-right font-mono tabular-nums text-sm text-[#0a0a0a]">
													{it.quantity}
												</td>
												<td className="px-4 py-3 text-right font-mono tabular-nums text-sm text-[#0a0a0a]">
													{formatPrice(it.unitPrice, "MYR")}
												</td>
												<td className="px-4 py-3 text-right font-mono tabular-nums text-sm font-semibold text-[#0a0a0a]">
													{formatPrice(it.totalPrice, "MYR")}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}

						{/* Invoices */}
						{invoices.length > 0 && (
							<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
								<div className="border-b border-[#e5e5e5] px-5 py-4">
									<h2 className="text-base font-bold text-[#0a0a0a]">
										Invoices
									</h2>
								</div>
								<table className="w-full">
									<thead className="bg-[#f3f3f3]">
										<tr className="border-b border-[#e5e5e5]">
											<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Invoice
											</th>
											<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Amount
											</th>
											<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Status
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[#e5e5e5]">
										{invoices.map((inv) => (
											<tr
												key={inv.id}
												className="transition-colors hover:bg-[#fafafa]"
											>
												<td className="px-4 py-3 font-mono tabular-nums text-sm text-[#0a0a0a]">
													{inv.invoiceNumber}
												</td>
												<td className="px-4 py-3 text-right font-mono tabular-nums text-sm text-[#0a0a0a]">
													{formatPrice(inv.totalAmount ?? 0, "MYR")}
												</td>
												<td className="px-4 py-3">
													<SalesStatusBadge status={inv.status} />
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}

						{/* Status History */}
						{organizationId && (
							<StatusHistoryCard
								organizationId={organizationId}
								salesOrderId={id}
							/>
						)}
					</div>

					{/* ── Dialogs (unchanged logic, Section 10 / 17) ── */}

					{organizationId && canRequestRefund && (
						<RequestRefundDialog
							open={refundDialogOpen}
							onOpenChange={setRefundDialogOpen}
							organizationId={organizationId}
							salesOrderId={id}
							customerName={order?.customerName ?? undefined}
							suggestedAmountCents={order?.totalAmount ?? undefined}
						/>
					)}

					{organizationId && canRequestRefund && (
						<PartialRefundDialog
							open={partialRefundDialogOpen}
							onOpenChange={setPartialRefundDialogOpen}
							organizationId={organizationId}
							branchId={order.branchId ?? undefined}
						/>
					)}

					{organizationId &&
						canCancelSale &&
						(order.status === "confirmed" || order.status === "completed") && (
							<CancelSaleDialog
								open={cancelDialogOpen}
								onOpenChange={setCancelDialogOpen}
								organizationId={organizationId}
								orderId={id}
								cancelledBy={userContext?.user?.id ?? ""}
								totalAmount={order.totalAmount ?? 0}
								onSuccess={() =>
									navigate({ to: "/dashboard/cancelled-sales/view" })
								}
							/>
						)}

					{/* Print Receipt */}
					<PrintReceiptDialog
						open={printDialogOpen}
						onOpenChange={setPrintDialogOpen}
						receiptLoading={receiptLoading}
						receiptError={receiptError}
						receiptData={
							receiptDataRaw != null ? mapReceiptResponse(receiptDataRaw) : null
						}
						onRetry={() => refetchReceipt()}
					/>
				</div>
			</div>
		</Skeleton>
	);
}
