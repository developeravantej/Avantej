import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { formatPrice, rmToCents } from "@/lib/money";
import { CopyableCell } from "@/components/tables/copyable-cell";
import DataTable from "@/components/tables/sales/view/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CanonicalStatus } from "@/components/ui/status-badge";
import { BranchSelector } from "@/components/branch/branch-selector";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from "@/components/ui/tabs";
import { ShoppingCart, Plus, CheckCircle, Package, Trash2, FileText } from "lucide-react";
import { LoadingSpinner, PageLoader } from "@/components/ui/loading-spinner";
import { useState, useCallback, useMemo } from "react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/purchase-orders/view"
)({
	component: RouteComponent,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleDateString("en-MY", {
		year: "numeric",
		month: "short",
		day: "2-digit",
	});
}

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PurchaseOrderRow = {
	id: string;
	purchaseOrderNumber: string;
	supplierId: string;
	branchId: string;
	orderDate: Date | string | null;
	expectedDeliveryDate: Date | string | null | undefined;
	totalAmount: number;
	status: string;
	notes: string | null | undefined;
	createdAt: Date | string | null;
};

type LineItem = {
	key: string;
	productId: string;
	orderedQty: string;
	unitCostRM: string;
};

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

// Maps PO statuses to canonical StatusBadge equivalents.
// "ordered" and "partially_received" are PO-domain states not in CanonicalStatus.
const PO_STATUS_MAP: Record<string, { status: CanonicalStatus; label?: string }> = {
	draft: { status: "draft" },
	approved: { status: "approved" },
	ordered: { status: "confirmed", label: "Ordered" },
	partially_received: { status: "in_transit", label: "Partial" },
	received: { status: "received" },
	cancelled: { status: "cancelled" },
};

function POStatusBadge({ status }: { status: string }) {
	const mapped = PO_STATUS_MAP[status] ?? { status: "draft" as CanonicalStatus, label: status };
	return <StatusBadge status={mapped.status} label={mapped.label} />;
}

// ---------------------------------------------------------------------------
// Create PO Sheet
// ---------------------------------------------------------------------------

type CreatePOSheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	onCreated: () => void;
};

function CreatePOSheet({ open, onOpenChange, organizationId, onCreated }: CreatePOSheetProps) {
	const [supplierId, setSupplierId] = useState("");
	const [branchId, setBranchId] = useState("");
	const [orderDate, setOrderDate] = useState(todayISO());
	const [expectedDelivery, setExpectedDelivery] = useState("");
	const [notes, setNotes] = useState("");
	const [lineItems, setLineItems] = useState<LineItem[]>([
		{ key: crypto.randomUUID(), productId: "", orderedQty: "1", unitCostRM: "" },
	]);

	const { data: suppliers = [] } = useQuery({
		queryKey: ["suppliers", organizationId],
		queryFn: () => client.suppliers.list({ organizationId }),
		enabled: !!organizationId && open,
	});

	const { data: products = [] } = useQuery({
		queryKey: ["products", organizationId],
		queryFn: () => client.products.list({ organizationId }),
		enabled: !!organizationId && open,
	});

	const createMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.purchaseOrders.create>[0]) =>
			client.purchaseOrders.create(input),
		successMessage: "Purchase order created successfully.",
		errorMessage: (err) => `Failed to create purchase order: ${err.message}`,
		onSuccess: () => {
			onCreated();
			handleClose();
		},
	});

	function handleClose() {
		onOpenChange(false);
		setSupplierId("");
		setBranchId("");
		setOrderDate(todayISO());
		setExpectedDelivery("");
		setNotes("");
		setLineItems([{ key: crypto.randomUUID(), productId: "", orderedQty: "1", unitCostRM: "" }]);
	}

	function addLine() {
		setLineItems((prev) => [
			...prev,
			{ key: crypto.randomUUID(), productId: "", orderedQty: "1", unitCostRM: "" },
		]);
	}

	function removeLine(key: string) {
		setLineItems((prev) => prev.filter((l) => l.key !== key));
	}

	function updateLine(key: string, field: keyof Omit<LineItem, "key">, value: string) {
		setLineItems((prev) =>
			prev.map((l) => (l.key === key ? { ...l, [field]: value } : l))
		);
	}

	const runningTotal = lineItems.reduce((sum, l) => {
		const qty = parseInt(l.orderedQty, 10) || 0;
		const cost = parseFloat(l.unitCostRM) || 0;
		return sum + qty * cost;
	}, 0);

	function handleSubmit() {
		if (!supplierId) { toast.error("Please select a supplier."); return; }
		if (!branchId.trim()) { toast.error("Please enter a branch ID."); return; }
		if (!orderDate) { toast.error("Please set an order date."); return; }

		const validItems = lineItems.filter(
			(l) => l.productId && parseInt(l.orderedQty, 10) > 0 && parseFloat(l.unitCostRM) > 0
		);
		if (validItems.length === 0) {
			toast.error("Add at least one valid line item.");
			return;
		}

		createMutation.mutate({
			organizationId,
			supplierId,
			branchId: branchId.trim(),
			// API expects z.string().datetime() — convert date-only string to ISO
			orderDate: new Date(orderDate).toISOString(),
			expectedDeliveryDate: expectedDelivery
				? new Date(expectedDelivery).toISOString()
				: undefined,
			notes: notes.trim() || undefined,
			items: validItems.map((l) => ({
				productId: l.productId,
				orderedQty: parseInt(l.orderedQty, 10),
				// API stores in cents; user enters in RM
				unitCost: rmToCents(parseFloat(l.unitCostRM)),
			})),
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>New Purchase Order</DialogTitle>
					<DialogDescription>
						Create a draft purchase order to send to a supplier.
					</DialogDescription>
				</DialogHeader>

				<div className="mt-6 space-y-5">
					{/* Supplier */}
					<div className="space-y-1.5">
						<Label htmlFor="po-supplier">Supplier</Label>
						<Select value={supplierId} onValueChange={setSupplierId}>
							<SelectTrigger id="po-supplier">
								<SelectValue placeholder="Select supplier…" />
							</SelectTrigger>
							<SelectContent>
								{suppliers.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Branch */}
					<div className="space-y-1.5">
						<Label htmlFor="po-branch">Branch</Label>
						<BranchSelector
							value={branchId}
							onChange={setBranchId}
							organizationId={organizationId}
							placeholder="Select destination branch…"
						/>
					</div>

					{/* Dates */}
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<Label htmlFor="po-order-date">Order Date</Label>
							<Input
								id="po-order-date"
								type="date"
								value={orderDate}
								onChange={(e) => setOrderDate(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="po-delivery-date">Expected Delivery</Label>
							<Input
								id="po-delivery-date"
								type="date"
								value={expectedDelivery}
								onChange={(e) => setExpectedDelivery(e.target.value)}
							/>
						</div>
					</div>

					{/* Notes */}
					<div className="space-y-1.5">
						<Label htmlFor="po-notes">Notes</Label>
						<Textarea
							id="po-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Optional notes for this order…"
							rows={2}
						/>
					</div>

					<Separator />

					{/* Line items */}
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-sm font-medium">Line Items</span>
							<Button type="button" size="sm" variant="outline" onClick={addLine}>
								<Plus className="h-3.5 w-3.5 mr-1" />
								Add Item
							</Button>
						</div>

						{lineItems.length === 0 && (
							<p className="text-sm text-muted-foreground text-center py-4">
								No items yet. Click "Add Item" to begin.
							</p>
						)}

						{lineItems.map((line, idx) => (
							<div key={line.key} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-end">
								<div className="space-y-1">
									{idx === 0 && <Label className="text-xs text-muted-foreground">Product</Label>}
									<Select
										value={line.productId}
										onValueChange={(v) => updateLine(line.key, "productId", v)}
									>
										<SelectTrigger className="h-8 text-sm">
											<SelectValue placeholder="Select…" />
										</SelectTrigger>
										<SelectContent>
											{products.map((p) => (
												<SelectItem key={p.id} value={p.id}>
													{p.name} ({p.sku})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-1">
									{idx === 0 && <Label className="text-xs text-muted-foreground">Qty</Label>}
									<Input
										className="h-8 text-sm"
										type="number"
										min="1"
										step="1"
										value={line.orderedQty}
										onChange={(e) => updateLine(line.key, "orderedQty", e.target.value)}
									/>
								</div>

								<div className="space-y-1">
									{idx === 0 && <Label className="text-xs text-muted-foreground">Unit Cost (RM)</Label>}
									<Input
										className="h-8 text-sm"
										type="number"
										min="0"
										step="0.01"
										value={line.unitCostRM}
										onChange={(e) => updateLine(line.key, "unitCostRM", e.target.value)}
										placeholder="0.00"
									/>
								</div>

								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-destructive"
									onClick={() => removeLine(line.key)}
									disabled={lineItems.length === 1}
								>
									<Trash2 className="h-3.5 w-3.5" />
								</Button>
							</div>
						))}

						{lineItems.length > 0 && (
							<div className="flex justify-end pt-1">
								<span className="text-sm font-medium text-muted-foreground">
									Running total:{" "}
									<span className="text-foreground font-semibold">
										{formatPrice(rmToCents(runningTotal), "MYR")}
									</span>
								</span>
							</div>
						)}
					</div>

					<Separator />

					<div className="flex gap-2 justify-end pt-1">
						<Button variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={createMutation.isPending}>
							{createMutation.isPending ? "Creating…" : "Create Draft PO"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Receive Items Sheet
// ---------------------------------------------------------------------------

type ReceiveItemsSheetProps = {
	poId: string | null;
	organizationId: string;
	onClose: () => void;
	onDone: () => void;
};

function ReceiveItemsSheet({ poId, organizationId, onClose, onDone }: ReceiveItemsSheetProps) {
	const [quantities, setQuantities] = useState<Record<string, string>>({});

	const { data: detail, isLoading } = useQuery({
		queryKey: ["purchaseOrders", organizationId, poId],
		queryFn: async () => {
			if (!poId || !organizationId) return null;
			return client.purchaseOrders.getById({ organizationId, id: poId });
		},
		enabled: !!poId && !!organizationId,
	});

	const { data: products = [] } = useQuery({
		queryKey: ["products", organizationId],
		queryFn: () => client.products.list({ organizationId }),
		enabled: !!poId && !!organizationId,
	});

	const productNameMap = useMemo(
		() => new Map(products.map((p) => [p.id, p.name])),
		[products],
	);

	const receiveMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.purchaseOrders.receiveItems>[0]) =>
			client.purchaseOrders.receiveItems(input),
		successMessage: "Items received successfully.",
		errorMessage: (err) => `Failed to receive items: ${err.message}`,
		onSuccess: () => {
			onDone();
			onClose();
		},
	});

	function handleSubmit() {
		if (!poId || !detail) return;

		const itemsToSubmit = (detail.items ?? [])
			.map((item) => ({
				itemId: item.id,
				receivedQty: parseInt(quantities[item.id] ?? "0", 10) || 0,
			}))
			.filter((i) => i.receivedQty > 0);

		if (itemsToSubmit.length === 0) {
			toast.error("Enter a received quantity for at least one item.");
			return;
		}

		receiveMutation.mutate({
			organizationId,
			purchaseOrderId: poId,
			items: itemsToSubmit,
		});
	}

	const order = detail?.order;
	const items = detail?.items ?? [];

	return (
		<Dialog open={!!poId} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="sm:max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Receive Items</DialogTitle>
					<DialogDescription>
						{order
							? `Record received quantities for PO ${order.purchaseOrderNumber}.`
							: "Loading purchase order…"}
					</DialogDescription>
				</DialogHeader>

				<div className="mt-6 space-y-4">
					{isLoading && (
						<div className="flex items-center justify-center py-8">
							<LoadingSpinner size="md" />
						</div>
					)}

					{!isLoading && items.length === 0 && (
						<p className="text-sm text-muted-foreground text-center py-4">
							No line items found for this purchase order.
						</p>
					)}

					{!isLoading && items.map((item) => {
						const remaining = item.orderedQty - (item.receivedQty ?? 0);
						return (
							<div key={item.id} className="space-y-1.5">
								<div className="flex items-center justify-between">
									<Label className="text-sm font-medium truncate max-w-[60%]">
										{productNameMap.get(item.productId) ?? item.productId}
									</Label>
									<span className="text-xs text-muted-foreground">
										Ordered: {item.orderedQty} | Received: {item.receivedQty ?? 0} | Remaining: {remaining}
									</span>
								</div>
								<Input
									type="number"
									min="0"
									max={remaining}
									step="1"
									placeholder={`Max ${remaining}`}
									value={quantities[item.id] ?? ""}
									onChange={(e) =>
										setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
									}
								/>
							</div>
						);
					})}

					{!isLoading && items.length > 0 && (
						<>
							<Separator />
							<div className="flex gap-2 justify-end">
								<Button variant="outline" onClick={onClose} disabled={receiveMutation.isPending}>
									Cancel
								</Button>
								<Button onClick={handleSubmit} disabled={receiveMutation.isPending}>
									{receiveMutation.isPending ? "Saving…" : "Confirm Receipt"}
								</Button>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Invoice status helpers
// ---------------------------------------------------------------------------

type InvoiceStatus = "pending" | "matched" | "disputed" | "paid";

const INVOICE_STATUS_MAP: Record<InvoiceStatus, { status: CanonicalStatus; label: string }> = {
	pending:  { status: "pending",   label: "Pending" },
	matched:  { status: "approved",  label: "Matched" },
	disputed: { status: "cancelled", label: "Disputed" },
	paid:     { status: "paid",      label: "Paid" },
};

function InvoiceStatusBadge({ status }: { status: string }) {
	const entry = INVOICE_STATUS_MAP[status as InvoiceStatus] ?? { status: "pending" as CanonicalStatus, label: status };
	return <StatusBadge status={entry.status} label={entry.label} />;
}

// ---------------------------------------------------------------------------
// RecordInvoiceDialog
// ---------------------------------------------------------------------------

type RecordInvoiceDialogProps = {
	poId: string | null;
	organizationId: string;
	onClose: () => void;
	onCreated: () => void;
};

function RecordInvoiceDialog({ poId, organizationId, onClose, onCreated }: RecordInvoiceDialogProps) {
	const [invoiceNumber, setInvoiceNumber] = useState("");
	const [goodsReceiptId, setGoodsReceiptId] = useState("");
	const [totalRM, setTotalRM] = useState("");
	const [taxRM, setTaxRM] = useState("");
	const [invoiceDate, setInvoiceDate] = useState(todayISO());
	const [dueDate, setDueDate] = useState("");
	const qc = useQueryClient();

	const { data: detail, isLoading: detailLoading } = useQuery({
		queryKey: ["purchaseOrders", organizationId, poId],
		queryFn: async () => {
			if (!poId || !organizationId) return null;
			return client.purchaseOrders.getById({ organizationId, id: poId });
		},
		enabled: !!poId && !!organizationId,
	});

	const { data: receipts = [] } = useQuery({
		queryKey: ["goodsReceiptsForPo", organizationId, poId],
		queryFn: async () => {
			if (!poId || !organizationId) return [];
			return client.goodsReceipts.listForPo({ organizationId, purchaseOrderId: poId });
		},
		enabled: !!poId && !!organizationId,
	});

	const postedReceipts = receipts.filter((r) => r.status === "posted");

	const createMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.goodsReceipts.createInvoice>[0]) =>
			client.goodsReceipts.createInvoice(input),
		successMessage: "Invoice recorded successfully.",
		errorMessage: (err) => `Failed to record invoice: ${err.message}`,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["supplierInvoices", organizationId] });
			onCreated();
			handleClose();
		},
	});

	function handleClose() {
		setInvoiceNumber("");
		setGoodsReceiptId("");
		setTotalRM("");
		setTaxRM("");
		setInvoiceDate(todayISO());
		setDueDate("");
		onClose();
	}

	function handleSubmit() {
		if (!poId || !detail?.order) return;
		if (!invoiceNumber.trim()) { toast.error("Invoice number is required."); return; }
		const total = parseFloat(totalRM);
		if (!totalRM || Number.isNaN(total) || total <= 0) { toast.error("Invoice total must be greater than 0."); return; }
		if (!invoiceDate) { toast.error("Invoice date is required."); return; }

		createMutation.mutate({
			organizationId,
			invoiceNumber: invoiceNumber.trim(),
			supplierId: detail.order.supplierId,
			purchaseOrderId: poId,
			goodsReceiptId: goodsReceiptId || undefined,
			totalCents: rmToCents(total),
			taxCents: taxRM && !Number.isNaN(parseFloat(taxRM)) ? rmToCents(parseFloat(taxRM)) : undefined,
			invoiceDate: new Date(invoiceDate).toISOString(),
			dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
		});
	}

	return (
		<Dialog open={!!poId} onOpenChange={(open) => { if (!open) handleClose(); }}>
			<DialogContent className="sm:max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Record Supplier Invoice</DialogTitle>
					<DialogDescription>
						{detail?.order
							? `Record an invoice against PO ${detail.order.purchaseOrderNumber}.`
							: "Loading purchase order…"}
					</DialogDescription>
				</DialogHeader>

				<div className="mt-4 space-y-4">
					{detailLoading && (
						<div className="flex items-center justify-center py-8">
							<LoadingSpinner size="md" />
						</div>
					)}

					{!detailLoading && (
						<>
							<div className="space-y-1.5">
								<Label htmlFor="inv-number">Invoice Number</Label>
								<Input
									id="inv-number"
									value={invoiceNumber}
									onChange={(e) => setInvoiceNumber(e.target.value)}
									placeholder="e.g. INV-2026-001"
								/>
							</div>

							{postedReceipts.length > 0 && (
								<div className="space-y-1.5">
									<Label htmlFor="inv-receipt">Goods Receipt (optional)</Label>
									<Select value={goodsReceiptId} onValueChange={setGoodsReceiptId}>
										<SelectTrigger id="inv-receipt">
											<SelectValue placeholder="Select posted receipt…" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="">— None —</SelectItem>
											{postedReceipts.map((r) => (
												<SelectItem key={r.id} value={r.id}>
													{r.receiptNumber} — {formatDate(r.receivedAt)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<Label htmlFor="inv-total">Invoice Total (RM)</Label>
									<Input
										id="inv-total"
										type="number"
										min="0"
										step="0.01"
										value={totalRM}
										onChange={(e) => setTotalRM(e.target.value)}
										placeholder="0.00"
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="inv-tax">Tax Amount (RM, optional)</Label>
									<Input
										id="inv-tax"
										type="number"
										min="0"
										step="0.01"
										value={taxRM}
										onChange={(e) => setTaxRM(e.target.value)}
										placeholder="0.00"
									/>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<Label htmlFor="inv-date">Invoice Date</Label>
									<Input
										id="inv-date"
										type="date"
										value={invoiceDate}
										onChange={(e) => setInvoiceDate(e.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="inv-due">Due Date (optional)</Label>
									<Input
										id="inv-due"
										type="date"
										value={dueDate}
										onChange={(e) => setDueDate(e.target.value)}
									/>
								</div>
							</div>

							<Separator />

							<div className="flex gap-2 justify-end">
								<Button variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
									Cancel
								</Button>
								<Button onClick={handleSubmit} disabled={createMutation.isPending}>
									{createMutation.isPending ? "Saving…" : "Save Invoice"}
								</Button>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// MatchReviewDialog
// ---------------------------------------------------------------------------

type MatchReviewDialogProps = {
	invoiceId: string | null;
	organizationId: string;
	onClose: () => void;
	onAction: () => void;
};

function MatchReviewDialog({ invoiceId, organizationId, onClose, onAction }: MatchReviewDialogProps) {
	const [disputeReason, setDisputeReason] = useState("");
	const [showDisputeForm, setShowDisputeForm] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const qc = useQueryClient();

	const { data: preview, isLoading } = useQuery({
		queryKey: ["invoicePreview", organizationId, invoiceId],
		queryFn: async () => {
			if (!invoiceId || !organizationId) return null;
			return client.goodsReceipts.getInvoicePreview({ organizationId, invoiceId });
		},
		enabled: !!invoiceId && !!organizationId,
	});

	const matchMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.goodsReceipts.matchInvoice>[0]) =>
			client.goodsReceipts.matchInvoice(input),
		successMessage: "Invoice matched successfully.",
		errorMessage: (err) => {
			setActionError(err.message);
			return `Match failed: ${err.message}`;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["supplierInvoices", organizationId] });
			onAction();
			onClose();
		},
	});

	const disputeMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.goodsReceipts.disputeInvoice>[0]) =>
			client.goodsReceipts.disputeInvoice(input),
		successMessage: "Invoice disputed.",
		errorMessage: (err) => {
			setActionError(err.message);
			return `Failed to dispute: ${err.message}`;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["supplierInvoices", organizationId] });
			onAction();
			onClose();
		},
	});

	function handleClose() {
		setDisputeReason("");
		setShowDisputeForm(false);
		setActionError(null);
		onClose();
	}

	return (
		<Dialog open={!!invoiceId} onOpenChange={(open) => { if (!open) handleClose(); }}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>3-Way Match Review</DialogTitle>
					<DialogDescription>
						Compare PO, receipt, and invoice totals to verify the match.
					</DialogDescription>
				</DialogHeader>

				<div className="mt-4 space-y-4">
					{isLoading && (
						<div className="flex items-center justify-center py-8">
							<LoadingSpinner size="md" />
						</div>
					)}

					{!isLoading && preview && (
						<>
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b">
										<th className="text-left pb-2 font-medium text-muted-foreground">Source</th>
										<th className="text-right pb-2 font-medium text-muted-foreground">Amount</th>
									</tr>
								</thead>
								<tbody>
									<tr className="border-b last:border-0">
										<td className="py-2">Purchase Order</td>
										<td className="py-2 text-right tabular-nums font-medium">
											{preview.poTotalCents !== null ? formatPrice(preview.poTotalCents, "MYR") : "N/A"}
										</td>
									</tr>
									<tr className="border-b last:border-0">
										<td className="py-2">Goods Receipt</td>
										<td className="py-2 text-right tabular-nums font-medium">
											{preview.receiptTotalCents !== null ? formatPrice(preview.receiptTotalCents, "MYR") : "N/A"}
										</td>
									</tr>
									<tr>
										<td className="py-2">Invoice</td>
										<td className="py-2 text-right tabular-nums font-medium">
											{formatPrice(preview.invoiceTotalCents, "MYR")}
										</td>
									</tr>
								</tbody>
							</table>

							<div className="text-xs text-muted-foreground">
								Tolerance: {formatPrice(preview.toleranceCents, "MYR")}
							</div>

							{preview.isWithinTolerance ? (
								<div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 font-medium">
									Within Tolerance — Ready to approve
								</div>
							) : (
								<div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
									<p className="font-medium mb-1">Mismatch Detected</p>
									<ul className="list-disc list-inside space-y-0.5">
										{preview.mismatches.map((m, i) => (
											<li key={i}>{m}</li>
										))}
									</ul>
								</div>
							)}

							{actionError && (
								<div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
									{actionError}
								</div>
							)}

							{showDisputeForm ? (
								<div className="space-y-2">
									<Label htmlFor="dispute-reason">Dispute Reason</Label>
									<Textarea
										id="dispute-reason"
										value={disputeReason}
										onChange={(e) => setDisputeReason(e.target.value)}
										placeholder="Describe the discrepancy…"
										rows={3}
									/>
									<div className="flex gap-2 justify-end">
										<Button variant="outline" size="sm" onClick={() => setShowDisputeForm(false)}>
											Back
										</Button>
										<Button
											size="sm"
											variant="destructive"
											disabled={!disputeReason.trim() || disputeMutation.isPending}
											onClick={() => {
												if (!invoiceId) return;
												setActionError(null);
												disputeMutation.mutate({ organizationId, invoiceId, reason: disputeReason.trim() });
											}}
										>
											{disputeMutation.isPending ? "Saving…" : "Confirm Dispute"}
										</Button>
									</div>
								</div>
							) : (
								<div className="flex gap-2 justify-end">
									<Button variant="outline" onClick={handleClose}>
										Close
									</Button>
									{preview.isWithinTolerance ? (
										<Button
											disabled={matchMutation.isPending}
											onClick={() => {
												if (!invoiceId) return;
												setActionError(null);
												matchMutation.mutate({ organizationId, invoiceId });
											}}
										>
											{matchMutation.isPending ? "Approving…" : "Approve Match"}
										</Button>
									) : (
										<Button
											variant="destructive"
											onClick={() => setShowDisputeForm(true)}
										>
											Dispute Invoice
										</Button>
									)}
								</div>
							)}
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// MarkPaidDialog
// ---------------------------------------------------------------------------

type MarkPaidDialogProps = {
	invoiceId: string | null;
	invoiceNumber: string;
	organizationId: string;
	onClose: () => void;
	onDone: () => void;
};

function MarkPaidDialog({ invoiceId, invoiceNumber, organizationId, onClose, onDone }: MarkPaidDialogProps) {
	const [paymentReference, setPaymentReference] = useState("");
	const qc = useQueryClient();

	const paidMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.goodsReceipts.markInvoicePaid>[0]) =>
			client.goodsReceipts.markInvoicePaid(input),
		successMessage: "Invoice marked as paid.",
		errorMessage: (err) => `Failed to mark as paid: ${err.message}`,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["supplierInvoices", organizationId] });
			onDone();
			handleClose();
		},
	});

	function handleClose() {
		setPaymentReference("");
		onClose();
	}

	return (
		<Dialog open={!!invoiceId} onOpenChange={(open) => { if (!open) handleClose(); }}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Mark Invoice as Paid</DialogTitle>
					<DialogDescription>
						Confirm that payment for invoice {invoiceNumber} has been sent.
					</DialogDescription>
				</DialogHeader>

				<div className="mt-4 space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="pay-ref">Payment Reference (optional)</Label>
						<Input
							id="pay-ref"
							value={paymentReference}
							onChange={(e) => setPaymentReference(e.target.value)}
							placeholder="e.g. TXN-12345"
						/>
					</div>

					<div className="flex gap-2 justify-end">
						<Button variant="outline" onClick={handleClose} disabled={paidMutation.isPending}>
							Cancel
						</Button>
						<Button
							disabled={paidMutation.isPending}
							onClick={() => {
								if (!invoiceId) return;
								paidMutation.mutate({
									organizationId,
									invoiceId,
									paymentReference: paymentReference.trim() || undefined,
								});
							}}
						>
							{paidMutation.isPending ? "Saving…" : "Confirm Paid"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// SupplierInvoicesTab
// ---------------------------------------------------------------------------

type SupplierInvoicesTabProps = {
	organizationId: string;
	canCreate: boolean;
	canUpdate: boolean;
};

function SupplierInvoicesTab({ organizationId, canCreate: _canCreate, canUpdate }: SupplierInvoicesTabProps) {
	const [reviewInvoiceId, setReviewInvoiceId] = useState<string | null>(null);
	const [paidInvoice, setPaidInvoice] = useState<{ id: string; number: string } | null>(null);
	const [statusFilter, setStatusFilter] = useState("");

	const { data: invoices = [], isLoading, isError, error, refetch } = useQuery({
		queryKey: ["supplierInvoices", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.goodsReceipts.listInvoices({
				organizationId,
				status: statusFilter || undefined,
			});
		},
		enabled: !!organizationId,
	});

	const { data: suppliers = [] } = useQuery({
		queryKey: ["suppliers", organizationId],
		queryFn: () => client.suppliers.list({ organizationId }),
		enabled: !!organizationId,
	});

	const supplierMap = useMemo(
		() => new Map(suppliers.map((s) => [s.id, s.name])),
		[suppliers],
	);

	type InvoiceRow = (typeof invoices)[number];

	const columns: ColumnDef<InvoiceRow>[] = [
		{
			id: "invoiceNumber",
			header: "Invoice #",
			accessorKey: "invoiceNumber",
			cell: ({ row }) => <CopyableCell value={row.original.invoiceNumber} />,
		},
		{
			id: "supplierId",
			header: "Supplier",
			accessorKey: "supplierId",
			cell: ({ row }) => (
				<span className="text-sm">{supplierMap.get(row.original.supplierId) ?? row.original.supplierId.slice(0, 8) + "…"}</span>
			),
		},
		{
			id: "purchaseOrderId",
			header: "PO",
			accessorKey: "purchaseOrderId",
			cell: ({ row }) => (
				<span className="text-xs font-mono text-muted-foreground">
					{row.original.purchaseOrderId ? row.original.purchaseOrderId.slice(0, 8) + "…" : "—"}
				</span>
			),
		},
		{
			id: "invoiceDate",
			header: "Invoice Date",
			accessorKey: "invoiceDate",
			cell: ({ row }) => <span className="text-sm">{formatDate(row.original.invoiceDate)}</span>,
		},
		{
			id: "dueDate",
			header: "Due Date",
			accessorKey: "dueDate",
			cell: ({ row }) => (
				<span className="text-sm">
					{row.original.dueDate ? formatDate(row.original.dueDate) : <span className="text-muted-foreground">—</span>}
				</span>
			),
		},
		{
			id: "totalCents",
			header: "Amount (MYR)",
			accessorKey: "totalCents",
			cell: ({ row }) => (
				<span className="text-sm font-medium tabular-nums">{formatPrice(row.original.totalCents, "MYR")}</span>
			),
		},
		{
			id: "status",
			header: "Status",
			accessorKey: "status",
			cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} />,
		},
		{
			id: "actions",
			header: "Actions",
			cell: ({ row }) => {
				const { id, status, invoiceNumber } = row.original;
				if (!canUpdate) return <span className="text-muted-foreground text-xs">—</span>;
				return (
					<div className="flex items-center gap-1.5">
						{(status === "pending" || status === "disputed") && (
							<Button
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => setReviewInvoiceId(id)}
							>
								Review Match
							</Button>
						)}
						{status === "matched" && (
							<Button
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => setPaidInvoice({ id, number: invoiceNumber })}
							>
								Mark Paid
							</Button>
						)}
					</div>
				);
			},
		},
	];

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
					<SelectTrigger className="w-40">
						<SelectValue placeholder="All statuses" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						<SelectItem value="pending">Pending</SelectItem>
						<SelectItem value="matched">Matched</SelectItem>
						<SelectItem value="disputed">Disputed</SelectItem>
						<SelectItem value="paid">Paid</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<DataTable<InvoiceRow, unknown>
				columns={columns}
				data={invoices}
				emptyTitle="No supplier invoices found"
				error={isError ? error : undefined}
				onRetry={() => refetch()}
			/>

			{isLoading && (
				<div className="flex justify-center py-6">
					<LoadingSpinner size="md" />
				</div>
			)}

			<MatchReviewDialog
				invoiceId={reviewInvoiceId}
				organizationId={organizationId}
				onClose={() => setReviewInvoiceId(null)}
				onAction={() => refetch()}
			/>

			{paidInvoice && (
				<MarkPaidDialog
					invoiceId={paidInvoice.id}
					invoiceNumber={paidInvoice.number}
					organizationId={organizationId}
					onClose={() => setPaidInvoice(null)}
					onDone={() => refetch()}
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main route component
// ---------------------------------------------------------------------------

function RouteComponent() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canCreate = hasPermission("purchase_order_management:create");
	const canUpdate = hasPermission("purchase_order_management:update");
	const qc = useQueryClient();

	const [createSheetOpen, setCreateSheetOpen] = useState(false);
	const [receivePoId, setReceivePoId] = useState<string | null>(null);
	const [invoicePoId, setInvoicePoId] = useState<string | null>(null);

	const { data: apiData = [], isLoading, isError, error, refetch } = useQuery({
		queryKey: ["purchaseOrders", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.purchaseOrders.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const approveMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.purchaseOrders.approve({ organizationId: organizationId!, id }),
		successMessage: "Purchase order approved.",
		errorMessage: (err) => `Failed to approve: ${err.message}`,
		invalidate: [["purchaseOrders", organizationId]],
	});

	const cancelMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.purchaseOrders.cancel({ organizationId: organizationId!, id }),
		successMessage: "Purchase order cancelled.",
		errorMessage: (err) => `Failed to cancel: ${err.message}`,
		invalidate: [["purchaseOrders", organizationId]],
	});

	const handleInvalidate = useCallback(() => {
		qc.invalidateQueries({ queryKey: ["purchaseOrders", organizationId] });
	}, [qc, organizationId]);

	const columns: ColumnDef<PurchaseOrderRow>[] = [
		{
			id: "purchaseOrderNumber",
			header: "PO #",
			accessorKey: "purchaseOrderNumber",
			cell: ({ row }) => (
				<CopyableCell value={row.original.purchaseOrderNumber} />
			),
		},
		{
			id: "supplierId",
			header: "Supplier",
			accessorKey: "supplierId",
			cell: ({ row }) => (
				<span className="text-sm font-mono text-muted-foreground truncate max-w-[120px] block" title={row.original.supplierId}>
					{row.original.supplierId.slice(0, 8)}…
				</span>
			),
		},
		{
			id: "branchId",
			header: "Branch",
			accessorKey: "branchId",
			cell: ({ row }) => (
				<span className="text-sm font-mono text-muted-foreground truncate max-w-[120px] block" title={row.original.branchId}>
					{row.original.branchId.slice(0, 8)}…
				</span>
			),
		},
		{
			id: "orderDate",
			header: "Order Date",
			accessorKey: "orderDate",
			cell: ({ row }) => (
				<span className="text-sm">{formatDate(row.original.orderDate)}</span>
			),
		},
		{
			id: "expectedDeliveryDate",
			header: "Expected Delivery",
			accessorKey: "expectedDeliveryDate",
			cell: ({ row }) => (
				<span className="text-sm">
					{row.original.expectedDeliveryDate
						? formatDate(row.original.expectedDeliveryDate)
						: <span className="text-muted-foreground">Not set</span>}
				</span>
			),
		},
		{
			id: "totalAmount",
			header: "Total (MYR)",
			accessorKey: "totalAmount",
			cell: ({ row }) => (
				<span className="text-sm font-medium tabular-nums">
					{formatPrice(row.original.totalAmount, "MYR")}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			accessorKey: "status",
			cell: ({ row }) => <POStatusBadge status={row.original.status} />,
		},
		{
			id: "actions",
			header: "Actions",
			cell: ({ row }) => {
				const { id, status } = row.original;
				if (!canUpdate && !canCreate) {
					return <span className="text-muted-foreground text-xs">—</span>;
				}
				const isApprovable = status === "draft";
				const isReceivable = ["approved", "ordered", "partially_received"].includes(status);
				const isCancellable = ["draft", "approved"].includes(status);
				const isInvoiceable = ["received", "partially_received"].includes(status);

				return (
					<div className="flex items-center gap-1.5">
						{isApprovable && (
							<Button
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => approveMutation.mutate(id)}
								disabled={approveMutation.isPending}
							>
								<CheckCircle className="h-3 w-3 mr-1" />
								Approve
							</Button>
						)}
						{isReceivable && (
							<Button
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => setReceivePoId(id)}
							>
								<Package className="h-3 w-3 mr-1" />
								Receive
							</Button>
						)}
						{isCancellable && (
							<Button
								size="sm"
								variant="destructive"
								className="h-7 text-xs"
								onClick={() => cancelMutation.mutate(id)}
								disabled={cancelMutation.isPending}
							>
								Cancel
							</Button>
						)}
						{isInvoiceable && canCreate && (
							<Button
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => setInvoicePoId(id)}
							>
								<FileText className="h-3 w-3 mr-1" />
								Invoice
							</Button>
						)}
					</div>
				);
			},
		},
	];

	const data: PurchaseOrderRow[] = apiData.map((item) => ({
		id: item.id,
		purchaseOrderNumber: item.purchaseOrderNumber,
		supplierId: item.supplierId,
		branchId: item.branchId,
		orderDate: item.orderDate,
		expectedDeliveryDate: item.expectedDeliveryDate,
		totalAmount: item.totalAmount,
		status: item.status,
		notes: item.notes,
		createdAt: item.createdAt,
	}));

	if (isLoading) {
		return <PageLoader />;
	}

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<ShoppingCart className="h-5 w-5 text-brand-secondary-1" />
					<h1 className="text-xl font-semibold font-heading">Purchase Orders</h1>
				</div>
				{organizationId && canCreate && (
					<Button size="sm" onClick={() => setCreateSheetOpen(true)}>
						<Plus className="h-4 w-4 mr-1" />
						New PO
					</Button>
				)}
			</div>

			{/* Tabs */}
			<Tabs defaultValue="orders" className="space-y-4">
				<TabsList>
					<TabsTrigger value="orders">Purchase Orders</TabsTrigger>
					<TabsTrigger value="invoices">Supplier Invoices</TabsTrigger>
				</TabsList>

				<TabsContent value="orders">
					<DataTable<PurchaseOrderRow, unknown>
						columns={columns}
						data={data}
						emptyTitle="No purchase orders found"
						emptyAction={canCreate ? { label: "New PO", onClick: () => setCreateSheetOpen(true) } : undefined}
						error={isError ? error : undefined}
						onRetry={() => refetch()}
					/>
				</TabsContent>

				<TabsContent value="invoices">
					{organizationId && (
						<SupplierInvoicesTab
							organizationId={organizationId}
							canCreate={canCreate}
							canUpdate={canUpdate}
						/>
					)}
				</TabsContent>
			</Tabs>

			{/* Create Sheet */}
			{organizationId && canCreate && (
				<CreatePOSheet
					open={createSheetOpen}
					onOpenChange={setCreateSheetOpen}
					organizationId={organizationId}
					onCreated={handleInvalidate}
				/>
			)}

			{/* Receive Items Sheet */}
			{organizationId && (
				<ReceiveItemsSheet
					poId={receivePoId}
					organizationId={organizationId}
					onClose={() => setReceivePoId(null)}
					onDone={handleInvalidate}
				/>
			)}

			{/* Record Invoice Dialog */}
			{organizationId && (
				<RecordInvoiceDialog
					poId={invoicePoId}
					organizationId={organizationId}
					onClose={() => setInvoicePoId(null)}
					onCreated={handleInvalidate}
				/>
			)}
		</div>
	);
}
