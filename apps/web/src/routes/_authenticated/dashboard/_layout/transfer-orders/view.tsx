import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import DataTable from "@/components/tables/sales/view/data-table";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { ArrowUpDown, Truck, CheckCircle, XCircle, Plus } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/transfer-orders/view",
)({
	component: TransferOrdersViewPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TransferOrderStatus = "pending" | "in_transit" | "completed" | "cancelled";

interface TransferOrderItem {
	id: string;
	productId: string;
	quantityTransferred: number;
	quantityReceived?: number | null;
	notes?: string | null;
}

interface TransferOrderRow {
	id: string;
	transferNumber: string;
	dateIssued: string;
	fromBranchId: string;
	toBranchId: string;
	issuedByMemberId: string;
	notes?: string | null;
	status: TransferOrderStatus;
	items: TransferOrderItem[];
	createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayIso(): string {
	return new Date().toISOString();
}

const STATUS_TABS: { value: string | undefined; label: string }[] = [
	{ value: undefined, label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "in_transit", label: "In Transit" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
];

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: TransferOrderStatus }) {
	switch (status) {
		case "pending":
			return (
				<Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
					Pending
				</Badge>
			);
		case "in_transit":
			return (
				<Badge variant="default" className="bg-orange-500 hover:bg-orange-600">
					In Transit
				</Badge>
			);
		case "completed":
			return (
				<Badge variant="default" className="bg-green-600 hover:bg-green-700">
					Completed
				</Badge>
			);
		case "cancelled":
			return <Badge variant="destructive">Cancelled</Badge>;
	}
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function TransferOrdersViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// ---- Filter state ----
	const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

	// ---- Create sheet state ----
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [formFromBranchId, setFormFromBranchId] = useState("");
	const [formToBranchId, setFormToBranchId] = useState("");
	const [formNotes, setFormNotes] = useState("");
	const [formProductId, setFormProductId] = useState("");
	const [formQuantity, setFormQuantity] = useState("");
	const [formItemNotes, setFormItemNotes] = useState("");

	// ---- Complete dialog state ----
	const [completeTarget, setCompleteTarget] = useState<TransferOrderRow | null>(null);
	const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});

	// ---- Cancel dialog state ----
	const [cancelTarget, setCancelTarget] = useState<string | null>(null);

	// ---- Query ----
	const { data: apiData = [], isLoading } = useQuery({
		queryKey: ["transferOrders", organizationId, statusFilter],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.transferOrders.list({
				organizationId,
				status: statusFilter,
			});
		},
		enabled: !!organizationId,
	});

	// ---- Mutations ----
	const createMutation = useMutation({
		mutationFn: (vars: {
			fromBranchId: string;
			toBranchId: string;
			notes?: string;
			productId: string;
			quantityTransferred: number;
			itemNotes?: string;
		}) =>
			client.transferOrders.create({
				organizationId: organizationId!,
				dateIssued: getTodayIso(),
				fromBranchId: vars.fromBranchId,
				toBranchId: vars.toBranchId,
				issuedByMemberId: userContext?.user.id ?? "",
				notes: vars.notes || undefined,
				items: [
					{
						productId: vars.productId,
						quantityTransferred: vars.quantityTransferred,
						notes: vars.itemNotes || undefined,
					},
				],
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["transferOrders", organizationId] });
			toast.success("Transfer order created");
			setIsCreateOpen(false);
			resetCreateForm();
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to create transfer order");
		},
	});

	const markInTransitMutation = useMutation({
		mutationFn: (id: string) =>
			client.transferOrders.markInTransit({ organizationId: organizationId!, id }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["transferOrders", organizationId] });
			toast.success("Transfer order marked in transit");
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to mark transfer in transit");
		},
	});

	const completeMutation = useMutation({
		mutationFn: (vars: { id: string; items: { itemId: string; quantityReceived: number }[] }) =>
			client.transferOrders.complete({
				organizationId: organizationId!,
				id: vars.id,
				items: vars.items,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["transferOrders", organizationId] });
			toast.success("Transfer order completed");
			setCompleteTarget(null);
			setReceiveQuantities({});
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to complete transfer order");
		},
	});

	const cancelMutation = useMutation({
		mutationFn: (id: string) =>
			client.transferOrders.cancel({ organizationId: organizationId!, id }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["transferOrders", organizationId] });
			toast.success("Transfer order cancelled");
			setCancelTarget(null);
		},
		onError: (err: Error) => {
			toast.error(err.message ?? "Failed to cancel transfer order");
		},
	});

	// ---- Helpers ----
	function resetCreateForm() {
		setFormFromBranchId("");
		setFormToBranchId("");
		setFormNotes("");
		setFormProductId("");
		setFormQuantity("");
		setFormItemNotes("");
	}

	function handleCreateSubmit() {
		if (!formFromBranchId.trim()) {
			toast.error("From branch ID is required");
			return;
		}
		if (!formToBranchId.trim()) {
			toast.error("To branch ID is required");
			return;
		}
		if (!formProductId.trim()) {
			toast.error("Product ID is required");
			return;
		}
		const qty = parseInt(formQuantity, 10);
		if (Number.isNaN(qty) || qty < 1) {
			toast.error("Quantity must be at least 1");
			return;
		}
		createMutation.mutate({
			fromBranchId: formFromBranchId.trim(),
			toBranchId: formToBranchId.trim(),
			notes: formNotes.trim() || undefined,
			productId: formProductId.trim(),
			quantityTransferred: qty,
			itemNotes: formItemNotes.trim() || undefined,
		});
	}

	function handleCompleteConfirm() {
		if (!completeTarget) return;
		const items = completeTarget.items.map((item) => ({
			itemId: item.id,
			quantityReceived: parseInt(receiveQuantities[item.id] ?? "0", 10) || 0,
		}));
		completeMutation.mutate({ id: completeTarget.id, items });
	}

	// ---- Table data ----
	const data: TransferOrderRow[] = apiData.map((item) => ({
		id: item.id,
		transferNumber: item.transferNumber,
		dateIssued: item.dateIssued ? new Date(item.dateIssued).toLocaleDateString() : "",
		fromBranchId: item.fromBranchId,
		toBranchId: item.toBranchId,
		issuedByMemberId: item.issuedByMemberId,
		notes: item.notes ?? null,
		status: item.status as TransferOrderStatus,
		items: [],
		createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : "",
	}));

	// ---- Columns ----
	const columns: ColumnDef<TransferOrderRow>[] = [
		{
			accessorKey: "transferNumber",
			header: ({ column }) => (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					className="-ml-3"
				>
					Transfer #
					<ArrowUpDown className="ml-2 h-4 w-4" />
				</Button>
			),
			cell: ({ getValue }) => <CopyableCell value={getValue<string>()} />,
		},
		{
			accessorKey: "dateIssued",
			header: "Date Issued",
			cell: ({ getValue }) => <span className="text-sm">{getValue<string>()}</span>,
		},
		{
			accessorKey: "fromBranchId",
			header: "From Branch",
			cell: ({ getValue }) => (
				<span className="text-sm text-muted-foreground">{getValue<string>()}</span>
			),
		},
		{
			accessorKey: "toBranchId",
			header: "To Branch",
			cell: ({ getValue }) => (
				<span className="text-sm text-muted-foreground">{getValue<string>()}</span>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ getValue }) => <StatusBadge status={getValue<TransferOrderStatus>()} />,
		},
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => {
				const { id, status } = row.original;

				if (status === "pending") {
					return (
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-orange-700 border-orange-300 hover:bg-orange-50"
								onClick={() => markInTransitMutation.mutate(id)}
								disabled={markInTransitMutation.isPending}
							>
								<Truck className="h-3.5 w-3.5" />
								Mark In Transit
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-red-700 border-red-300 hover:bg-red-50"
								onClick={() => setCancelTarget(id)}
							>
								<XCircle className="h-3.5 w-3.5" />
								Cancel
							</Button>
						</div>
					);
				}

				if (status === "in_transit") {
					return (
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-green-700 border-green-300 hover:bg-green-50"
								onClick={() => {
									setCompleteTarget(row.original);
									const initial: Record<string, string> = {};
									for (const item of row.original.items) {
										initial[item.id] = String(item.quantityTransferred);
									}
									setReceiveQuantities(initial);
								}}
							>
								<CheckCircle className="h-3.5 w-3.5" />
								Complete
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-red-700 border-red-300 hover:bg-red-50"
								onClick={() => setCancelTarget(id)}
							>
								<XCircle className="h-3.5 w-3.5" />
								Cancel
							</Button>
						</div>
					);
				}

				return <span className="text-muted-foreground text-xs">—</span>;
			},
		},
	];

	// ---- Guard ----
	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view transfer orders.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	// ---- Render ----
	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Transfer Orders</h1>
					<p className="text-sm text-muted-foreground">
						Manage inventory transfers between branches
					</p>
				</div>
				<Button
					onClick={() => {
						resetCreateForm();
						setIsCreateOpen(true);
					}}
					className="gap-2"
				>
					<Plus className="h-4 w-4" />
					New Transfer
				</Button>
			</div>

			{/* Status filter tabs */}
			<div className="flex items-center gap-1 border-b">
				{STATUS_TABS.map((tab) => {
					const isActive = statusFilter === tab.value;
					return (
						<button
							key={tab.label}
							type="button"
							onClick={() => setStatusFilter(tab.value)}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Table */}
			<DataTable<TransferOrderRow, unknown> columns={columns} data={data} />

			{/* ------------------------------------------------------------------ */}
			{/* Create Transfer Order Sheet                                         */}
			{/* ------------------------------------------------------------------ */}
			<Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
					<SheetHeader>
						<SheetTitle>New Transfer Order</SheetTitle>
						<SheetDescription>
							Create a new inventory transfer between branches.
						</SheetDescription>
					</SheetHeader>

					<div className="flex flex-col gap-4 px-4 py-2">
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								From Branch ID <span className="text-destructive">*</span>
							</label>
							<Input
								placeholder="UUID of source branch"
								value={formFromBranchId}
								onChange={(e) => setFormFromBranchId(e.target.value)}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								To Branch ID <span className="text-destructive">*</span>
							</label>
							<Input
								placeholder="UUID of destination branch"
								value={formToBranchId}
								onChange={(e) => setFormToBranchId(e.target.value)}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								Notes{" "}
								<span className="text-muted-foreground text-xs">(optional)</span>
							</label>
							<Textarea
								placeholder="Additional notes..."
								value={formNotes}
								onChange={(e) => setFormNotes(e.target.value)}
								rows={2}
							/>
						</div>

						<div className="border-t pt-4">
							<p className="text-sm font-semibold mb-3">Item</p>

							<div className="flex flex-col gap-3">
								<div className="flex flex-col gap-1.5">
									<label className="text-sm font-medium">
										Product ID <span className="text-destructive">*</span>
									</label>
									<Input
										placeholder="UUID of product"
										value={formProductId}
										onChange={(e) => setFormProductId(e.target.value)}
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<label className="text-sm font-medium">
										Quantity <span className="text-destructive">*</span>
									</label>
									<Input
										type="number"
										min="1"
										placeholder="1"
										value={formQuantity}
										onChange={(e) => setFormQuantity(e.target.value)}
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<label className="text-sm font-medium">
										Item Notes{" "}
										<span className="text-muted-foreground text-xs">(optional)</span>
									</label>
									<Input
										placeholder="Notes for this item"
										value={formItemNotes}
										onChange={(e) => setFormItemNotes(e.target.value)}
									/>
								</div>
							</div>
						</div>
					</div>

					<SheetFooter className="px-4">
						<Button
							variant="outline"
							onClick={() => setIsCreateOpen(false)}
							disabled={createMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={handleCreateSubmit}
							disabled={createMutation.isPending}
						>
							{createMutation.isPending ? "Creating…" : "Create"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>

			{/* ------------------------------------------------------------------ */}
			{/* Complete Transfer Dialog                                            */}
			{/* ------------------------------------------------------------------ */}
			<Dialog
				open={completeTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setCompleteTarget(null);
						setReceiveQuantities({});
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Complete Transfer Order</DialogTitle>
						<DialogDescription>
							Enter the quantity received for each item.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-3 py-2">
						{(completeTarget?.items ?? []).map((item) => (
							<div key={item.id} className="flex items-center gap-3">
								<div className="flex-1 text-sm text-muted-foreground truncate">
									<span className="font-medium text-foreground">Product:</span>{" "}
									{item.productId}
									<br />
									<span className="text-xs">Transferred: {item.quantityTransferred}</span>
								</div>
								<Input
									type="number"
									min="0"
									className="w-24"
									value={receiveQuantities[item.id] ?? String(item.quantityTransferred)}
									onChange={(e) =>
										setReceiveQuantities((prev) => ({
											...prev,
											[item.id]: e.target.value,
										}))
									}
								/>
							</div>
						))}
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setCompleteTarget(null);
								setReceiveQuantities({});
							}}
							disabled={completeMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={handleCompleteConfirm}
							disabled={completeMutation.isPending}
						>
							{completeMutation.isPending ? "Completing…" : "Confirm Complete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ------------------------------------------------------------------ */}
			{/* Cancel Confirmation Dialog                                          */}
			{/* ------------------------------------------------------------------ */}
			<Dialog
				open={cancelTarget !== null}
				onOpenChange={(open) => {
					if (!open) setCancelTarget(null);
				}}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Cancel Transfer Order</DialogTitle>
						<DialogDescription>
							Are you sure you want to cancel this transfer order? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setCancelTarget(null)}
							disabled={cancelMutation.isPending}
						>
							Keep
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (cancelTarget) cancelMutation.mutate(cancelTarget);
							}}
							disabled={cancelMutation.isPending}
						>
							{cancelMutation.isPending ? "Cancelling…" : "Cancel Order"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
