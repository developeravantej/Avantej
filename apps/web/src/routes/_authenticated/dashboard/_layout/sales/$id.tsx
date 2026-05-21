import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { ChevronLeft, Printer, XCircle } from "lucide-react";
import { useState } from "react";
import type { ReceiptData } from "@/components/pos/receipt-view";
import { ReceiptView } from "@/components/pos/receipt-view";
import { PartialRefundDialog } from "@/components/refunds/partial-refund-dialog";
import { RequestRefundDialog } from "@/components/refunds/request-refund-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CanonicalStatus } from "@/components/ui/status-badge";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";
import { toast } from "sonner";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/$id",
)({
	beforeLoad: async () => {
		await requirePermission("sales:read");
	},
	component: SalesOrderDetailPage,
});

const STATUS_MAP: Record<string, { status: CanonicalStatus; label?: string }> =
	{
		confirmed: { status: "confirmed" },
		completed: { status: "completed" },
		paid: { status: "paid" },
		pending: { status: "pending" },
		processing: { status: "pending", label: "Processing" },
		draft: { status: "draft" },
		sent: { status: "confirmed", label: "Sent" },
		partially_paid: { status: "pending", label: "Partially Paid" },
		cancelled: { status: "cancelled" },
		rejected: { status: "rejected" },
		overdue: { status: "rejected", label: "Overdue" },
	};

function SalesStatusBadge({ status }: { status?: string | null }) {
	if (!status) return <StatusBadge status="draft" label="Unknown" />;
	const mapped = STATUS_MAP[status] ?? {
		status: "draft" as CanonicalStatus,
		label: status,
	};
	return <StatusBadge status={mapped.status} label={mapped.label} />;
}

function StatusHistoryCard({
	organizationId,
	salesOrderId,
}: {
	organizationId: string;
	salesOrderId: string;
}) {
	const { data, isLoading } = useQuery({
		queryKey: ["salesOrders", "statusHistory", salesOrderId],
		queryFn: () =>
			client.salesOrders.statusHistory({ organizationId, salesOrderId }),
	});

	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="text-base font-bold text-[#0a0a0a]">Status History</h2>
			</div>

			{isLoading ? (
				<div className="space-y-3">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-14 w-full rounded bg-[#e5e5e5] animate-pulse"
						/>
					))}
				</div>
			) : !data?.rows.length ? (
				<p className="text-sm text-[#737373]">No history available.</p>
			) : (
				<ol className="relative ml-3 space-y-4 border-l border-[#e5e5e5]">
					{data.rows.map((entry) => (
						<li key={entry.id} className="ml-4">
							<div className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#737373]" />
							<div className="flex flex-wrap items-center gap-2">
								{entry.fromStatus !== null ? (
									<span className="text-sm text-[#737373]">
										<SalesStatusBadge status={entry.fromStatus} />
										{" → "}
									</span>
								) : (
									<span className="text-sm italic text-[#737373]">
										Initial state →{" "}
									</span>
								)}
								<SalesStatusBadge status={entry.toStatus} />
							</div>
							<p className="mt-0.5 font-mono tabular-nums text-[10px] text-[#737373]">
								{entry.changedByName} &middot;{" "}
								{new Date(entry.changedAt).toLocaleString()}
							</p>
							{entry.reason && (
								<p className="mt-0.5 text-xs text-[#737373]">
									Reason: {entry.reason}
								</p>
							)}
							{entry.notes && (
								<p className="mt-0.5 text-xs text-[#737373]">
									Notes: {entry.notes}
								</p>
							)}
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

// ─── Cancel Sale Dialog ───────────────────────────────────────────────────────

const CANCELLATION_REASON_CATEGORIES = [
	{ value: "customer_changed_mind", label: "Customer changed mind" },
	{ value: "payment_failed", label: "Payment failed" },
	{ value: "wrong_item", label: "Wrong item" },
	{ value: "fraud_suspected", label: "Fraud suspected" },
	{ value: "system_error", label: "System error" },
	{ value: "other", label: "Other" },
] as const;

type CancellationReasonCategory =
	(typeof CANCELLATION_REASON_CATEGORIES)[number]["value"];

interface CancelSaleDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	orderId: string;
	cancelledBy: string;
	totalAmount: number;
	onSuccess: () => void;
}

function CancelSaleDialog({
	open,
	onOpenChange,
	organizationId,
	orderId,
	cancelledBy,
	totalAmount,
	onSuccess,
}: CancelSaleDialogProps) {
	const [reason, setReason] = useState("");
	const [reasonCategory, setReasonCategory] = useState<
		CancellationReasonCategory | ""
	>("");
	const qc = useQueryClient();

	const { mutate: cancelSale, isPending } = useMutation({
		mutationFn: () =>
			client.salesOrders.cancel({
				organizationId,
				id: orderId,
				cancelledBy,
				reason: reason.trim() || undefined,
				refundAmount: totalAmount,
				cancellationReasonCategory: (reasonCategory ||
					undefined) as CancellationReasonCategory | undefined,
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["salesOrders"] });
			qc.invalidateQueries({ queryKey: ["cancelledSales"] });
			toast.success("Sale cancelled successfully");
			onOpenChange(false);
			setReason("");
			setReasonCategory("");
			onSuccess();
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to cancel sale",
			);
		},
	});

	const reasonTooShort =
		reason.trim().length > 0 && reason.trim().length < 5;
	const canSubmit = reason.trim().length >= 5 && !isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md" data-testid="cancel-sale-dialog">
				<DialogHeader>
					<DialogTitle>Cancel Sale</DialogTitle>
					<DialogDescription>
						This action cannot be undone. The order will be marked as cancelled
						and a cancellation record will be created.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="cancel-category" className="text-sm font-medium">
							Category{" "}
							<span className="font-normal text-[#737373]">(optional)</span>
						</Label>
						<Select
							value={reasonCategory || "none"}
							onValueChange={(v) =>
								setReasonCategory(
									v === "none" ? "" : (v as CancellationReasonCategory),
								)
							}
						>
							<SelectTrigger
								id="cancel-category"
								className="w-full"
								data-testid="cancel-category-select"
							>
								<SelectValue placeholder="Select a category…" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">No category</SelectItem>
								{CANCELLATION_REASON_CATEGORIES.map((cat) => (
									<SelectItem key={cat.value} value={cat.value}>
										{cat.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="cancel-reason" className="text-sm font-medium">
							Reason <span className="text-rose-600">*</span>
						</Label>
						<Textarea
							id="cancel-reason"
							placeholder="Provide a reason for cancellation (min 5 characters)"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							rows={3}
							data-testid="cancel-sale-reason-input"
						/>
						{reasonTooShort && (
							<p className="text-xs text-rose-600">
								Reason must be at least 5 characters.
							</p>
						)}
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Keep Sale
					</Button>
					<Button
						variant="destructive"
						onClick={() => cancelSale()}
						disabled={!canSubmit}
						data-testid="cancel-sale-confirm-button"
					>
						{isPending ? "Cancelling..." : "Cancel Sale"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

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
		queryKey: ["salesOrders", id],
		queryFn: async () => {
			if (!organizationId) return null;
			return client.salesOrders.getById({ organizationId, id });
		},
		enabled: !!organizationId,
	});

	const { data: invoices = [] } = useQuery({
		queryKey: ["invoices", "by-order", id],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.invoices.list({ organizationId, salesOrderId: id });
		},
		enabled: !!organizationId,
	});

	const {
		data: receiptDataRaw,
		isLoading: receiptLoading,
		isError: receiptError,
		refetch: refetchReceipt,
	} = useQuery({
		queryKey: ["pos-receipt", organizationId, id],
		queryFn: async () => {
			if (!organizationId) return null;
			return client.pos.getReceiptData({ organizationId, salesOrderId: id });
		},
		enabled: !!organizationId && printDialogOpen,
		retry: 1,
	});

	if (orderLoading) {
		return <PageLoader />;
	}

	if (orderError || !order) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6" data-testid="pos-sale-success-screen">
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

	const formattedDate = order.date
		? new Date(order.date).toLocaleDateString("en-MY", {
				day: "numeric",
				month: "short",
				year: "numeric",
			})
		: "—";

	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
			{/* ── Detail page header (Section 12.1) ── */}
			<div className="mb-5">
				<Link
					to="/dashboard/sales/view"
					className="mb-1 inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-[#737373] hover:text-[#0a0a0a] transition-colors"
				>
					<ChevronLeft className="h-3 w-3" />
					Sales
				</Link>
				<div className="flex items-end justify-between">
					<div>
						<h1
							className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]"
							data-testid="pos-sale-success-id"
						>
							{order.salesOrderNumber}
						</h1>
						<div className="mt-1 flex items-center gap-2 text-sm text-[#737373]">
							<span className="font-mono tabular-nums">{formattedDate}</span>
							<span>·</span>
							<SalesStatusBadge status={order.status} />
						</div>
					</div>

					{/* Secondary action buttons — detail pages rarely need a primary CTA */}
					<div className="flex items-center gap-2">
						{canCancelSale && order.status === "confirmed" && (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-[10px] bg-red-600 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-red-700"
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
								className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
								onClick={() => setRefundDialogOpen(true)}
							>
								Request Refund
							</button>
						)}
						{canRequestRefund && (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
								onClick={() => setPartialRefundDialogOpen(true)}
							>
								Partial Refund
							</button>
						)}
						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
							onClick={() => setPrintDialogOpen(true)}
							data-testid="print-receipt-button"
						>
							<Printer className="h-4 w-4" />
							Print Receipt
						</button>
					</div>
				</div>
			</div>

			{/* ── Sections (single-column scroll, Section 12.2) ── */}
			<div className="space-y-5">
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
						<dd className="text-[#0a0a0a]">
							{order.customerName ?? "—"}
						</dd>

						<dt className="text-[#737373]">Created By</dt>
						<dd className="text-[#0a0a0a]">
							{(order as { createdByName?: string | null }).createdByName ??
								order.createdBy ??
								"—"}
						</dd>

						<dt className="text-[#737373]">Customer Type</dt>
						<dd className="text-[#0a0a0a]">
							{order.customerType ?? "—"}
						</dd>

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

				{/* Invoices */}
				{invoices.length > 0 && (
					<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
						<div className="border-b border-[#e5e5e5] px-5 py-4">
							<h2 className="text-base font-bold text-[#0a0a0a]">Invoices</h2>
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
					branchId={
						(order as { branchId?: string | null })?.branchId ?? undefined
					}
				/>
			)}

			{organizationId && canCancelSale && order.status === "confirmed" && (
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
			<Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
				<DialogContent className="sm:max-w-md">
					{receiptLoading ? (
						<div className="flex flex-col items-center justify-center gap-3 py-10">
							<div className="h-5 w-40 rounded bg-[#e5e5e5] animate-pulse" />
							<div className="h-4 w-32 rounded bg-[#e5e5e5] animate-pulse" />
							<p className="mt-2 text-sm text-[#737373]">Loading receipt…</p>
						</div>
					) : receiptError || receiptDataRaw == null ? (
						<div
							className="flex flex-col items-center justify-center gap-3 py-10"
							data-testid="receipt-unavailable-message"
						>
							<p className="font-medium text-rose-600">Receipt unavailable</p>
							<p className="text-center text-sm text-[#737373]">
								Receipt data could not be loaded. Please try again or contact
								support.
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => refetchReceipt()}
							>
								Retry
							</Button>
						</div>
					) : (
						<ReceiptView data={mapReceiptResponse(receiptDataRaw)} />
					)}
					<div className="mt-4 flex justify-end gap-2 print:hidden">
						<Button
							variant="outline"
							onClick={() => setPrintDialogOpen(false)}
						>
							Close
						</Button>
						{!receiptLoading && !receiptError && receiptDataRaw != null && (
							<Button onClick={() => window.print()}>
								<Printer className="mr-2 h-4 w-4" />
								Print
							</Button>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

// ─── Map pos.getReceiptData response (nested) to flat ReceiptData ─────────────

type ReceiptApiResponse = {
	order: {
		salesOrderNumber: string;
		date: Date | string | null;
		customerType: string | null;
		customerName: string | null;
		totalAmount: number | null;
	};
	items: Array<{
		description: string | null;
		serviceName?: string | null;
		quantity: number;
		unitPrice: number;
		totalPrice: number;
	}>;
	payment: {
		paymentMethod: string;
		amount: number | null;
		taxAmount: number | null;
		totalAmount: number | null;
	} | null;
	invoice: { invoiceNumber: string } | null;
};

function mapReceiptResponse(raw: unknown): ReceiptData {
	const r = raw as ReceiptApiResponse;
	const order = r.order;
	const subtotal = r.items.reduce((s, it) => s + (it.totalPrice ?? 0), 0);
	const tax = r.payment?.taxAmount ?? 0;
	const total = r.payment?.totalAmount ?? order.totalAmount ?? subtotal + tax;
	const method = (r.payment?.paymentMethod ?? "cash") as ReceiptData["paymentMethod"];
	return {
		salesOrderNumber: order.salesOrderNumber,
		invoiceNumber: r.invoice?.invoiceNumber ?? "—",
		date: order.date ?? new Date(),
		customerName: order.customerName ?? "—",
		customerType: (order.customerType as "member" | "walk_in") ?? "member",
		items: r.items.map((it) => ({
			description: it.description ?? it.serviceName ?? "Item",
			quantity: it.quantity,
			unitPriceCents: it.unitPrice,
		})),
		subtotalCents: subtotal,
		discountCents: 0,
		taxCents: tax,
		totalCents: total,
		paymentMethod: method,
	};
}
