import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { useState } from "react";
import type { ReceiptData } from "@/components/pos/receipt-view";
import { ReceiptView } from "@/components/pos/receipt-view";
import { PartialRefundDialog } from "@/components/refunds/partial-refund-dialog";
import { RequestRefundDialog } from "@/components/refunds/request-refund-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CanonicalStatus } from "@/components/ui/status-badge";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/sales/$id",
)({
	component: SalesOrderDetailPage,
});

// Maps non-canonical statuses to the nearest canonical equivalent with a display label override.
// "processing", "sent", "partially_paid", "overdue" are sales-domain states not in CanonicalStatus.
const STATUS_MAP: Record<string, { status: CanonicalStatus; label?: string }> = {
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
	const mapped = STATUS_MAP[status] ?? { status: "draft" as CanonicalStatus, label: status };
	return <StatusBadge status={mapped.status} label={mapped.label} />;
}

function SalesOrderDetailPage() {
	const { id } = Route.useParams();
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const [printDialogOpen, setPrintDialogOpen] = useState(false);
	const [refundDialogOpen, setRefundDialogOpen] = useState(false);
	const [partialRefundDialogOpen, setPartialRefundDialogOpen] = useState(false);
	const canRequestRefund = hasPermission("refund_management:create");

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

	// Receipt data — loaded on demand when dialog opens; graceful fallback if pos.getReceiptData not yet mounted.
	const { data: receiptDataRaw } = useQuery({
		queryKey: ["pos-receipt", organizationId, id],
		queryFn: async () => {
			if (!organizationId) return null;
			return client.pos.getReceiptData({
				organizationId,
				salesOrderId: id,
			});
		},
		enabled: !!organizationId && printDialogOpen,
	});

	if (orderLoading) {
		return <PageLoader />;
	}

	if (orderError || !order) {
		return (
			<div className="mx-auto max-w-4xl p-6">
				<Link to="/dashboard/sales/view">
					<Button variant="ghost" size="sm" className="mb-4">
						<ArrowLeft className="mr-2 h-4 w-4" /> Back to Sales Orders
					</Button>
				</Link>
				<StatusCallout
					variant="error"
					title="Order not found"
					message={orderError instanceof Error ? orderError.message : "This order could not be loaded."}
				/>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-4xl p-6">
			<Link to="/dashboard/sales/view">
				<Button variant="ghost" size="sm" className="mb-4">
					<ArrowLeft className="mr-2 h-4 w-4" /> Back to Sales Orders
				</Button>
			</Link>

			<div className="mb-6 flex items-start justify-between">
				<div>
					<h1 className="font-bold font-heading text-2xl">
						Sales Order #{order.salesOrderNumber}
					</h1>
					<div className="mt-1 flex items-center gap-3">
						<SalesStatusBadge status={order.status} />
						<span className="text-muted-foreground">
							{order.date
								? new Date(order.date).toLocaleDateString()
								: "\u2014"}
						</span>
					</div>
				</div>
				<div className="flex gap-2">
					{canRequestRefund && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setRefundDialogOpen(true)}
						>
							Request Refund
						</Button>
					)}
					{canRequestRefund && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPartialRefundDialogOpen(true)}
						>
							Partial Refund
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						onClick={() => setPrintDialogOpen(true)}
					>
						<Printer className="mr-2 h-4 w-4" />
						Print Receipt
					</Button>
				</div>
			</div>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Order Summary</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-4">
						<div>
							<dt className="text-muted-foreground text-sm">Total Amount</dt>
							<dd className="font-medium">
								{formatPrice(order.totalAmount ?? 0, "MYR")}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-sm">Customer</dt>
							<dd className="font-medium">{order.customerName ?? "\u2014"}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-sm">Created By</dt>
							<dd className="font-medium">{(order as { createdByName?: string | null }).createdByName ?? order.createdBy ?? "\u2014"}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-sm">Status</dt>
							<dd>
								<SalesStatusBadge status={order.status} />
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-sm">Customer Type</dt>
							<dd className="font-medium">{order.customerType ?? "\u2014"}</dd>
						</div>
						{/* Legacy refund indicator (§5.13): sales cancelled before refunds ledger was introduced */}
						{(order as any).cancelledAmount > 0 && (
							<div className="col-span-2">
								<dt className="text-muted-foreground text-sm">Legacy Refund</dt>
								<dd className="font-medium text-amber-700">
									Already refunded (legacy): {formatPrice((order as any).cancelledAmount, "MYR")}
								</dd>
							</div>
						)}
						{order.notes && (
							<div className="col-span-2">
								<dt className="text-muted-foreground text-sm">Notes</dt>
								<dd className="font-medium">{order.notes}</dd>
							</div>
						)}
					</dl>
				</CardContent>
			</Card>

			{invoices.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Invoices</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{invoices.map((inv) => (
								<div
									key={inv.id}
									className="flex items-center justify-between rounded border p-3"
								>
									<span className="font-mono text-sm">{inv.invoiceNumber}</span>
									<span className="text-sm">
										{formatPrice(inv.totalAmount ?? 0, "MYR")}
									</span>
									<SalesStatusBadge status={inv.status} />
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Request Refund dialog */}
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

			{/* Partial Refund dialog (Agent 2.8 — J5) */}
			{organizationId && canRequestRefund && (
				<PartialRefundDialog
					open={partialRefundDialogOpen}
					onOpenChange={setPartialRefundDialogOpen}
					organizationId={organizationId}
					branchId={(order as { branchId?: string | null })?.branchId ?? undefined}
				/>
			)}

			{/* Print Receipt dialog */}
			<Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<ReceiptView
						data={
							receiptDataRaw != null
								? mapReceiptResponse(receiptDataRaw)
								: buildReceiptData(order, invoices)
						}
					/>
					<div className="mt-4 flex justify-end gap-2 print:hidden">
						<Button variant="outline" onClick={() => setPrintDialogOpen(false)}>
							Close
						</Button>
						<Button onClick={() => window.print()}>
							<Printer className="mr-2 h-4 w-4" />
							Print
						</Button>
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

// ─── Receipt data builder (from existing sales order data) ─────────────────────

function buildReceiptData(
	order: {
		salesOrderNumber: string;
		date?: Date | null;
		customerName?: string | null;
		customerType?: string | null;
		totalAmount?: number | null;
		notes?: string | null;
	},
	invoices: Array<{
		invoiceNumber: string;
		totalAmount?: number | null;
	}>,
): ReceiptData {
	const firstInvoice = invoices[0];
	return {
		salesOrderNumber: order.salesOrderNumber,
		invoiceNumber: firstInvoice?.invoiceNumber ?? "—",
		date: order.date ?? new Date(),
		customerName: order.customerName ?? "—",
		customerType: (order.customerType as "member" | "walk_in") ?? "member",
		// Items not available from this endpoint — show total only
		items: [],
		subtotalCents: order.totalAmount ?? 0,
		discountCents: 0,
		taxCents: 0,
		totalCents: order.totalAmount ?? 0,
		paymentMethod: "cash",
	};
}
