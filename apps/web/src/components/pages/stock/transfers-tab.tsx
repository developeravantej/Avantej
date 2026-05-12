import { useQuery } from "@tanstack/react-query";
import { useState, useRef } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { StatusBadge } from "@/components/ui/status-badge";
import type { CanonicalStatus } from "@/components/ui/status-badge";

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
// Page component
// ---------------------------------------------------------------------------

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
export function TransferOrdersTabPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canCreate = hasPermission("inventory_management:create");
	const canUpdate = hasPermission("inventory_management:update");
	const transferOrdersKey = ["transferOrders", organizationId];

	// ---- Branch nodes query ----
	const { data: nodesData } = useQuery({
		queryKey: ["hierarchyNodes", organizationId],
		queryFn: async () => {
			if (!organizationId) return { nodes: [] };
			return client.hierarchy.listNodes({ organizationId });
		},
		enabled: !!organizationId,
	});
	const branches = ((nodesData?.nodes ?? []) as Array<{ id: string; type: string; name: string }>).filter((n) => n.type === "branch");

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
	const [isFetchingCompleteItems, setIsFetchingCompleteItems] = useState(false);

	// ---- Cancel dialog state ----
	const [cancelTarget, setCancelTarget] = useState<string | null>(null);

	// ---- Query ----
	const { data: apiData = [], isLoading, isError, refetch } = useQuery({
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
	const createMutation = useApiMutation({
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
		successMessage: "Transfer order created",
		errorMessage: (err) =>
			`Failed to create transfer order: ${err.message || "An unexpected error occurred"}`,
		invalidate: [transferOrdersKey],
		onSuccess: () => {
			setIsCreateOpen(false);
			resetCreateForm();
		},
	});

	const markInTransitMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.transferOrders.markInTransit({ organizationId: organizationId!, id }),
		successMessage: "Transfer order marked in transit",
		errorMessage: (err) =>
			`Failed to mark transfer in transit: ${err.message || "An unexpected error occurred"}`,
		invalidate: [transferOrdersKey],
	});

	const completeMutation = useApiMutation({
		mutationFn: (vars: { id: string; items: { itemId: string; quantityReceived: number }[] }) =>
			client.transferOrders.complete({
				organizationId: organizationId!,
				id: vars.id,
				items: vars.items,
			}),
		successMessage: "Transfer order completed",
		errorMessage: (err) =>
			`Failed to complete transfer order: ${err.message || "An unexpected error occurred"}`,
		invalidate: [transferOrdersKey],
		onSuccess: () => {
			setCompleteTarget(null);
			setReceiveQuantities({});
		},
	});

	const cancelMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.transferOrders.cancel({ organizationId: organizationId!, id }),
		successMessage: "Transfer order cancelled",
		errorMessage: (err) =>
			`Failed to cancel transfer order: ${err.message || "An unexpected error occurred"}`,
		invalidate: [transferOrdersKey],
		onSuccess: () => {
			setCancelTarget(null);
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
			toast.error("From branch is required");
			return;
		}
		if (!formToBranchId.trim()) {
			toast.error("To branch is required");
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

	// ---- Fetch items for complete dialog ----
	async function openCompleteDialog(row: TransferOrderRow) {
		if (!organizationId) return;
		setIsFetchingCompleteItems(true);
		try {
			const detail = await client.transferOrders.getById({
				organizationId,
				id: row.id,
			});
			const rowWithItems: TransferOrderRow = {
				...row,
				items: detail.items.map((item: any) => ({
					id: item.id,
					productId: item.productId,
					quantityTransferred: item.quantityTransferred,
					quantityReceived: item.quantityReceived ?? null,
					notes: item.notes ?? null,
				})),
			};
			setCompleteTarget(rowWithItems);
			const initial: Record<string, string> = {};
			for (const item of rowWithItems.items) {
				initial[item.id] = String(item.quantityTransferred);
			}
			setReceiveQuantities(initial);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load transfer items");
		} finally {
			setIsFetchingCompleteItems(false);
		}
	}

	// ---- Table data ----
	const data: TransferOrderRow[] = apiData.map((item: any) => ({
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
					<ArrowUpDown className="ml-2 size-4" />
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
			cell: ({ getValue }) => <StatusBadge status={getValue<TransferOrderStatus>() as CanonicalStatus} />,
		},
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => {
				const { id, status } = row.original;
				if (!canUpdate) {
					return <span className="text-muted-foreground text-xs">-</span>;
				}

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
								<Truck className="size-3.5" />
								Mark In Transit
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-red-700 border-red-300 hover:bg-red-50"
								onClick={() => setCancelTarget(id)}
							>
								<XCircle className="size-3.5" />
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
								onClick={() => openCompleteDialog(row.original)}
								disabled={isFetchingCompleteItems}
							>
								<CheckCircle className="size-3.5" />
								{isFetchingCompleteItems ? "Loading…" : "Complete"}
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-red-700 border-red-300 hover:bg-red-50"
								onClick={() => setCancelTarget(id)}
							>
								<XCircle className="size-3.5" />
								Cancel
							</Button>
						</div>
					);
				}

				return <span className="text-muted-foreground text-xs">-</span>;
			},
		},
	];

	// ---- Branch combobox ----
	// react-doctor-disable-next-line react-doctor/no-nested-component-definition -- closes over `branches` query result; lifting requires threading branches + filtering state through props
	function BranchCombobox({
		id,
		value,
		onChange,
		placeholder,
		required: _required,
	}: {
		id?: string;
		value: string;
		onChange: (id: string) => void;
		placeholder: string;
		required?: boolean;
	}) {
		const [search, setSearch] = useState("");
		const [open, setOpen] = useState(false);
		const containerRef = useRef<HTMLDivElement>(null);

		const selectedBranch = branches.find((b) => b.id === value);
		const displayValue = open ? search : (selectedBranch?.name ?? "");
		const filtered = branches.filter((b) =>
			b.name.toLowerCase().includes(search.toLowerCase()),
		);

		return (
			<div className="relative" ref={containerRef}>
				<Input
					id={id}
					placeholder={placeholder}
					value={displayValue}
					onChange={(e) => {
						setSearch(e.target.value);
						if (!open) setOpen(true);
					}}
					onFocus={() => {
						setSearch("");
						setOpen(true);
					}}
					onBlur={() => setTimeout(() => setOpen(false), 150)}
				/>
				{open && (
					<div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
						<div className="max-h-48 overflow-y-auto p-1">
							{filtered.length === 0 ? (
								<div className="px-2 py-3 text-sm text-muted-foreground text-center">
									No branches found
								</div>
							) : (
								filtered.map((b) => (
									<button
										key={b.id}
										type="button"
										className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => {
											onChange(b.id);
											setSearch("");
											setOpen(false);
										}}
									>
										{b.name}
									</button>
								))
							)}
						</div>
					</div>
				)}
			</div>
		);
	}

	// ---- Guard ----
	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view transfer orders.
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
	}

	if (isError) {
		return (
			<div className="p-6">
				<StatusCallout variant="error" title="Couldn't load transfer orders" onRetry={() => refetch()} />
			</div>
		);
	}

	// ---- Render ----
	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold font-heading">Transfer Orders</h1>
					<p className="text-sm text-brand-secondary-1">
						Manage inventory transfers between branches
					</p>
				</div>
				{canCreate && (
					<Button
						onClick={() => {
							resetCreateForm();
							setIsCreateOpen(true);
						}}
						className="gap-2"
					>
						<Plus className="size-4" />
						New Transfer
					</Button>
				)}
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
			<DataTable<TransferOrderRow, unknown>
				columns={columns}
				data={data}
				emptyTitle="No transfer orders"
				emptyDescription="Create a new transfer to move inventory between branches."
			/>

			{/* ------------------------------------------------------------------ */}
			{/* Create Transfer Order Sheet                                         */}
			{/* ------------------------------------------------------------------ */}
			<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<DialogContent className="sm:max-w-md overflow-y-auto">
					<DialogHeader>
						<DialogTitle>New Transfer Order</DialogTitle>
						<DialogDescription>
							Create a new inventory transfer between branches.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-4 px-4 py-2">
						<div className="flex flex-col gap-1.5">
							<label htmlFor="transfer-from-branch" className="text-sm font-medium">
								From Branch <span className="text-destructive">*</span>
							</label>
							<BranchCombobox
								id="transfer-from-branch"
								value={formFromBranchId}
								onChange={setFormFromBranchId}
								placeholder="Search source branch..."
								required
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<label htmlFor="transfer-to-branch" className="text-sm font-medium">
								To Branch <span className="text-destructive">*</span>
							</label>
							<BranchCombobox
								id="transfer-to-branch"
								value={formToBranchId}
								onChange={setFormToBranchId}
								placeholder="Search destination branch..."
								required
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
									<label htmlFor="transfer-product-id" className="text-sm font-medium">
										Product ID <span className="text-destructive">*</span>
									</label>
									<Input
										id="transfer-product-id"
										placeholder="UUID of product"
										value={formProductId}
										onChange={(e) => setFormProductId(e.target.value)}
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<label htmlFor="transfer-qty" className="text-sm font-medium">
										Quantity <span className="text-destructive">*</span>
									</label>
									<Input
										id="transfer-qty"
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

					<DialogFooter className="px-4">
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
					</DialogFooter>
				</DialogContent>
			</Dialog>

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
