import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { CopyableCell } from "@/components/tables/copyable-cell";
import DataTable from "@/components/tables/sales/view/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
	ShoppingCart,
	Plus,
	CheckCircle,
	Package,
	FileText,
} from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { useState, useCallback } from "react";
import type { PurchaseOrderRow } from "@/features/purchase-orders/types";
import { POStatusBadge } from "@/features/purchase-orders/components/POStatusBadge";
import { CreatePOSheet } from "@/features/purchase-orders/components/CreatePOSheet";
import { ReceiveItemsSheet } from "@/features/purchase-orders/components/ReceiveItemsSheet";
import { RecordInvoiceDialog } from "@/features/purchase-orders/components/RecordInvoiceDialog";
import { SupplierInvoicesTab } from "@/features/purchase-orders/components/SupplierInvoicesTab";

export const Route = createLazyFileRoute(
	"/_authenticated/dashboard/_layout/purchase-orders/view",
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
	// Phase 8.5 — confirmation dialogs for destructive PO actions. Both
	// approve and cancel previously fired on first click; the UI now requires
	// an explicit second confirmation so a wayward click can't change PO state.
	const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
	const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

	const {
		data: apiData = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		...orpc.purchaseOrders.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const approveMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.purchaseOrders.approve({ organizationId: organizationId!, id }),
		successMessage: "Purchase order approved.",
		errorMessage: (err) => `Failed to approve: ${err.message}`,
		invalidate: [
			orpc.purchaseOrders.list.queryOptions({
				input: { organizationId: organizationId! },
			}).queryKey,
		],
	});

	const cancelMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.purchaseOrders.cancel({ organizationId: organizationId!, id }),
		successMessage: "Purchase order cancelled.",
		errorMessage: (err) => `Failed to cancel: ${err.message}`,
		invalidate: [
			orpc.purchaseOrders.list.queryOptions({
				input: { organizationId: organizationId! },
			}).queryKey,
		],
	});

	const handleInvalidate = useCallback(() => {
		qc.invalidateQueries(
			orpc.purchaseOrders.list.queryOptions({
				input: { organizationId: organizationId! },
			}),
		);
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
				<span
					className="text-sm font-mono text-[#737373] truncate max-w-[120px] block"
					title={row.original.supplierId}
				>
					{row.original.supplierId.slice(0, 8)}…
				</span>
			),
		},
		{
			id: "branchId",
			header: "Branch",
			accessorKey: "branchId",
			cell: ({ row }) => (
				<span
					className="text-sm font-mono text-[#737373] truncate max-w-[120px] block"
					title={row.original.branchId}
				>
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
					{row.original.expectedDeliveryDate ? (
						formatDate(row.original.expectedDeliveryDate)
					) : (
						<span className="text-[#737373]">Not set</span>
					)}
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
					return <span className="text-[#737373] text-xs">-</span>;
				}
				const isApprovable = status === "draft";
				const isReceivable = [
					"approved",
					"ordered",
					"partially_received",
				].includes(status);
				const isCancellable = ["draft", "approved"].includes(status);
				const isInvoiceable = ["received", "partially_received"].includes(
					status,
				);

				return (
					<div className="flex items-center gap-1.5">
						{isApprovable && (
							<Button
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => setConfirmApproveId(id)}
								disabled={approveMutation.isPending}
							>
								<CheckCircle className="size-3 mr-1" />
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
								<Package className="size-3 mr-1" />
								Receive
							</Button>
						)}
						{isCancellable && (
							<Button
								size="sm"
								variant="destructive"
								className="h-7 text-xs"
								onClick={() => setConfirmCancelId(id)}
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
								<FileText className="size-3 mr-1" />
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

	return (
		<Skeleton
			name="purchase-orders-view"
			loading={isLoading}
			fallback={<PageLoader />}
		>
			<div className="space-y-4">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<ShoppingCart className="size-5 text-brand-secondary-1" />
						<h1 className="text-xl font-semibold font-heading">
							Purchase Orders
						</h1>
					</div>
					{organizationId && canCreate && (
						<Button size="sm" onClick={() => setCreateSheetOpen(true)}>
							<Plus className="size-4 mr-1" />
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
							emptyAction={
								canCreate
									? { label: "New PO", onClick: () => setCreateSheetOpen(true) }
									: undefined
							}
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

				{/* Approve confirmation */}
				<Dialog
					open={confirmApproveId !== null}
					onOpenChange={(open) => !open && setConfirmApproveId(null)}
				>
					<DialogContent
						className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
						hideCloseButton
					>
						<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
								PURCHASE ORDERS
							</p>
							<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
								Approve purchase order?
							</DialogTitle>
							<DialogDescription className="text-sm text-[#737373]">
								This commits the order — supplier can be notified and it can no
								longer be edited. Continue?
							</DialogDescription>
						</DialogHeader>
						<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setConfirmApproveId(null)}
								disabled={approveMutation.isPending}
							>
								Cancel
							</Button>
							<Button
								className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
								disabled={approveMutation.isPending}
								onClick={() => {
									if (confirmApproveId) {
										approveMutation.mutate(confirmApproveId, {
											onSettled: () => setConfirmApproveId(null),
										});
									}
								}}
							>
								{approveMutation.isPending ? "Approving…" : "Approve"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Cancel confirmation */}
				<Dialog
					open={confirmCancelId !== null}
					onOpenChange={(open) => !open && setConfirmCancelId(null)}
				>
					<DialogContent
						className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
						hideCloseButton
					>
						<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
								PURCHASE ORDERS
							</p>
							<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
								Cancel purchase order?
							</DialogTitle>
							<DialogDescription className="text-sm text-[#737373]">
								The order will be marked cancelled. This cannot be undone — to
								reorder, create a new purchase order.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setConfirmCancelId(null)}
								disabled={cancelMutation.isPending}
							>
								Keep order
							</Button>
							<Button
								className="bg-red-600 hover:bg-red-700 text-white"
								disabled={cancelMutation.isPending}
								onClick={() => {
									if (confirmCancelId) {
										cancelMutation.mutate(confirmCancelId, {
											onSettled: () => setConfirmCancelId(null),
										});
									}
								}}
							>
								{cancelMutation.isPending ? "Cancelling…" : "Cancel order"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</Skeleton>
	);
}
