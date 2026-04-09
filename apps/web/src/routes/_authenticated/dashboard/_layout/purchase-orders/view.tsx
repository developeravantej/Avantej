import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { CopyableCell } from "@/components/tables/copyable-cell";
import DataTable from "@/components/tables/sales/view/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet";
import { ShoppingCart, Plus, CheckCircle, Package, Trash2 } from "lucide-react";
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

function StatusBadge({ status }: { status: string }) {
	const map: Record<string, { label: string; variant: "outline" | "secondary" | "default" | "destructive" }> = {
		draft: { label: "Draft", variant: "outline" },
		approved: { label: "Approved", variant: "secondary" },
		ordered: { label: "Ordered", variant: "secondary" },
		partially_received: { label: "Partial", variant: "secondary" },
		received: { label: "Received", variant: "default" },
		cancelled: { label: "Cancelled", variant: "destructive" },
	};
	const cfg = map[status] ?? { label: status, variant: "outline" };
	return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
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

	const createMutation = useMutation({
		mutationFn: (input: Parameters<typeof client.purchaseOrders.create>[0]) =>
			client.purchaseOrders.create(input),
		onSuccess: () => {
			toast.success("Purchase order created successfully.");
			onCreated();
			handleClose();
		},
		onError: (err: Error) => {
			toast.error(`Failed to create purchase order: ${err.message}`);
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
				unitCost: Math.round(parseFloat(l.unitCostRM) * 100),
			})),
		});
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
				<SheetHeader>
					<SheetTitle>New Purchase Order</SheetTitle>
					<SheetDescription>
						Create a draft purchase order to send to a supplier.
					</SheetDescription>
				</SheetHeader>

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
						<Label htmlFor="po-branch">Branch ID</Label>
						<Input
							id="po-branch"
							value={branchId}
							onChange={(e) => setBranchId(e.target.value)}
							placeholder="UUID of the destination branch"
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
										{formatPrice(runningTotal * 100, "MYR")}
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
			</SheetContent>
		</Sheet>
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

	const receiveMutation = useMutation({
		mutationFn: (input: Parameters<typeof client.purchaseOrders.receiveItems>[0]) =>
			client.purchaseOrders.receiveItems(input),
		onSuccess: () => {
			toast.success("Items received successfully.");
			onDone();
			onClose();
		},
		onError: (err: Error) => {
			toast.error(`Failed to receive items: ${err.message}`);
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
		<Sheet open={!!poId} onOpenChange={(open) => { if (!open) onClose(); }}>
			<SheetContent className="w-full sm:max-w-lg overflow-y-auto">
				<SheetHeader>
					<SheetTitle>Receive Items</SheetTitle>
					<SheetDescription>
						{order
							? `Record received quantities for PO ${order.purchaseOrderNumber}.`
							: "Loading purchase order…"}
					</SheetDescription>
				</SheetHeader>

				<div className="mt-6 space-y-4">
					{isLoading && (
						<div className="flex items-center justify-center py-8">
							<div className="animate-spin h-6 w-6 border-2 border-current border-r-transparent rounded-full" />
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
			</SheetContent>
		</Sheet>
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

	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["purchaseOrders", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.purchaseOrders.list({ organizationId });
		},
		enabled: !!organizationId,
	});

	const approveMutation = useMutation({
		mutationFn: (id: string) =>
			client.purchaseOrders.approve({ organizationId: organizationId!, id }),
		onSuccess: () => {
			toast.success("Purchase order approved.");
			qc.invalidateQueries({ queryKey: ["purchaseOrders", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(`Failed to approve: ${err.message}`);
		},
	});

	const cancelMutation = useMutation({
		mutationFn: (id: string) =>
			client.purchaseOrders.cancel({ organizationId: organizationId!, id }),
		onSuccess: () => {
			toast.success("Purchase order cancelled.");
			qc.invalidateQueries({ queryKey: ["purchaseOrders", organizationId] });
		},
		onError: (err: Error) => {
			toast.error(`Failed to cancel: ${err.message}`);
		},
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
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			id: "actions",
			header: "Actions",
			cell: ({ row }) => {
				const { id, status } = row.original;
				if (!canUpdate) {
					return <span className="text-muted-foreground text-xs">—</span>;
				}
				const isApprovable = status === "draft";
				const isReceivable = ["approved", "ordered", "partially_received"].includes(status);
				const isCancellable = ["draft", "approved"].includes(status);

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
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading…</span>
				</div>
			</div>
		);
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

			{/* Table */}
			<DataTable<PurchaseOrderRow, unknown> columns={columns} data={data} />

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
		</div>
	);
}
