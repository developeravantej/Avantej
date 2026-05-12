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
import { ArrowUpDown, CheckCircle, XCircle, PackageCheck, Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CanonicalStatus } from "@/components/ui/status-badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StockRequestStatus = "pending" | "approved" | "rejected" | "fulfilled";

interface StockRequestItem {
	id: string;
	productId: string;
	quantityRequested: number;
	quantityFulfilled?: number | null;
	notes?: string | null;
}

interface StockRequestRow {
	id: string;
	requestNumber: string;
	dateIssued: string;
	issuedByMemberId: string;
	fromBranchId?: string | null;
	toBranchId: string;
	destinationLabel?: string | null;
	notes?: string | null;
	status: StockRequestStatus;
	items: StockRequestItem[];
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
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
	{ value: "fulfilled", label: "Fulfilled" },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function StockRequestsTabPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canCreate = hasPermission("inventory_management:create");
	const canUpdate = hasPermission("inventory_management:update");

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
	const [formToBranchId, setFormToBranchId] = useState("");
	const [formFromBranchId, setFormFromBranchId] = useState("");
	const [formNotes, setFormNotes] = useState("");
	const [formDestinationLabel, setFormDestinationLabel] = useState("");
	// Single item for create form (simplification — enough for basic use)
	const [formProductId, setFormProductId] = useState("");
	const [formQuantity, setFormQuantity] = useState("");
	const [formItemNotes, setFormItemNotes] = useState("");

	// ---- Fulfill dialog state ----
	const [fulfillTarget, setFulfillTarget] = useState<StockRequestRow | null>(null);
	const [fulfillQuantities, setFulfillQuantities] = useState<Record<string, string>>({});
	const [isFetchingFulfillItems, setIsFetchingFulfillItems] = useState(false);

	// ---- Query ----
	const { data: apiData = [], isLoading, isError, refetch } = useQuery({
		queryKey: ["stockRequests", organizationId, statusFilter],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.stockRequests.list({
				organizationId,
				status: statusFilter,
			});
		},
		enabled: !!organizationId,
	});

	// ---- Mutations ----
	const createMutation = useApiMutation({
		mutationFn: (vars: {
			toBranchId: string;
			fromBranchId?: string;
			destinationLabel?: string;
			notes?: string;
			productId: string;
			quantityRequested: number;
			itemNotes?: string;
		}) =>
			client.stockRequests.create({
				organizationId: organizationId!,
				dateIssued: getTodayIso(),
				issuedByMemberId: userContext?.user.id ?? "",
				toBranchId: vars.toBranchId,
				fromBranchId: vars.fromBranchId || undefined,
				destinationLabel: vars.destinationLabel || undefined,
				notes: vars.notes || undefined,
				items: [
					{
						productId: vars.productId,
						quantityRequested: vars.quantityRequested,
						notes: vars.itemNotes || undefined,
					},
				],
			}),
		successMessage: "Stock request created",
		errorMessage: (error) =>
			`Failed to create stock request: ${error.message || "An unexpected error occurred"}`,
		invalidate: [["stockRequests", organizationId]],
		onSuccess: () => {
			setIsCreateOpen(false);
			resetCreateForm();
		},
	});

	const approveMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.stockRequests.approve({ organizationId: organizationId!, id }),
		successMessage: "Stock request approved",
		errorMessage: (error) =>
			`Failed to approve stock request: ${error.message || "An unexpected error occurred"}`,
		invalidate: [["stockRequests", organizationId]],
	});

	const rejectMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.stockRequests.reject({ organizationId: organizationId!, id }),
		successMessage: "Stock request rejected",
		errorMessage: (error) =>
			`Failed to reject stock request: ${error.message || "An unexpected error occurred"}`,
		invalidate: [["stockRequests", organizationId]],
	});

	const fulfillMutation = useApiMutation({
		mutationFn: (vars: { id: string; items: { itemId: string; quantityFulfilled: number }[] }) =>
			client.stockRequests.fulfill({
				organizationId: organizationId!,
				id: vars.id,
				items: vars.items,
			}),
		successMessage: "Stock request fulfilled",
		errorMessage: (error) =>
			`Failed to fulfill stock request: ${error.message || "An unexpected error occurred"}`,
		invalidate: [["stockRequests", organizationId]],
		onSuccess: () => {
			setFulfillTarget(null);
			setFulfillQuantities({});
		},
	});

	// ---- Helpers ----
	function resetCreateForm() {
		setFormToBranchId("");
		setFormFromBranchId("");
		setFormNotes("");
		setFormDestinationLabel("");
		setFormProductId("");
		setFormQuantity("");
		setFormItemNotes("");
	}

	function handleCreateSubmit() {
		if (!formToBranchId.trim()) {
			toast.error("Destination branch is required");
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
			toBranchId: formToBranchId.trim(),
			fromBranchId: formFromBranchId.trim() || undefined,
			destinationLabel: formDestinationLabel.trim() || undefined,
			notes: formNotes.trim() || undefined,
			productId: formProductId.trim(),
			quantityRequested: qty,
			itemNotes: formItemNotes.trim() || undefined,
		});
	}

	function handleFulfillConfirm() {
		if (!fulfillTarget) return;
		const items = fulfillTarget.items.map((item) => ({
			itemId: item.id,
			quantityFulfilled: parseInt(fulfillQuantities[item.id] ?? "0", 10) || 0,
		}));
		fulfillMutation.mutate({ id: fulfillTarget.id, items });
	}

	// ---- Fetch items for fulfill dialog ----
	async function openFulfillDialog(row: StockRequestRow) {
		if (!organizationId) return;
		setIsFetchingFulfillItems(true);
		try {
			const detail = await client.stockRequests.getById({
				organizationId,
				id: row.id,
			});
			const rowWithItems: StockRequestRow = {
				...row,
				items: detail.items.map((item: any) => ({
					id: item.id,
					productId: item.productId,
					quantityRequested: item.quantityRequested,
					quantityFulfilled: item.quantityFulfilled ?? null,
					notes: item.notes ?? null,
				})),
			};
			setFulfillTarget(rowWithItems);
			const initial: Record<string, string> = {};
			for (const item of rowWithItems.items) {
				initial[item.id] = String(item.quantityRequested);
			}
			setFulfillQuantities(initial);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to load request items");
		} finally {
			setIsFetchingFulfillItems(false);
		}
	}

	// ---- Table data ----
	const data: StockRequestRow[] = apiData.map((item: any) => ({
		id: item.id,
		requestNumber: item.requestNumber,
		dateIssued: item.dateIssued ? new Date(item.dateIssued).toLocaleDateString() : "",
		issuedByMemberId: item.issuedByMemberId,
		fromBranchId: item.fromBranchId ?? null,
		toBranchId: item.toBranchId,
		destinationLabel: item.destinationLabel ?? null,
		notes: item.notes ?? null,
		status: item.status as StockRequestStatus,
		items: [],
		createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : "",
	}));

	// ---- Columns ----
	const columns: ColumnDef<StockRequestRow>[] = [
		{
			accessorKey: "requestNumber",
			header: ({ column }) => (
				<Button
					variant="ghost"
					onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
					className="-ml-3"
				>
					Request #
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
			accessorKey: "issuedByMemberId",
			header: "Issued By",
			cell: ({ getValue }) => <CopyableCell value={getValue<string>()} />,
		},
		{
			accessorKey: "toBranchId",
			header: "To Branch",
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{row.original.destinationLabel ?? row.original.toBranchId}
				</span>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ getValue }) => <StatusBadge status={getValue<StockRequestStatus>() as CanonicalStatus} />,
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
								className="h-7 gap-1 text-green-700 border-green-300 hover:bg-green-50"
								onClick={() => approveMutation.mutate(id)}
								disabled={approveMutation.isPending}
							>
								<CheckCircle className="size-3.5" />
								Approve
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-red-700 border-red-300 hover:bg-red-50"
								onClick={() => rejectMutation.mutate(id)}
								disabled={rejectMutation.isPending}
							>
								<XCircle className="size-3.5" />
								Reject
							</Button>
						</div>
					);
				}
				if (status === "approved") {
					return (
						<Button
							size="sm"
							variant="outline"
							className="h-7 gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
							onClick={() => openFulfillDialog(row.original)}
							disabled={isFetchingFulfillItems}
						>
							<PackageCheck className="size-3.5" />
							{isFetchingFulfillItems ? "Loading…" : "Fulfill"}
						</Button>
					);
				}
				return <span className="text-muted-foreground text-xs">-</span>;
			},
		},
	];

	// ---- Branch combobox ----
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
				Select an organization to view stock requests.
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
	}

	if (isError) {
		return (
			<div className="p-6">
				<StatusCallout variant="error" title="Couldn't load stock requests" onRetry={() => refetch()} />
			</div>
		);
	}

	// ---- Render ----
	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold font-heading">Stock Requests</h1>
					<p className="text-sm text-brand-secondary-1">
						Manage inventory stock requests between branches
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
						New Request
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
			<DataTable<StockRequestRow, unknown>
				columns={columns}
				data={data}
				emptyTitle="No stock requests"
				emptyDescription="Create a new request to move inventory between branches."
			/>

			{/* ------------------------------------------------------------------ */}
			{/* Create Stock Request Sheet                                          */}
			{/* ------------------------------------------------------------------ */}
			<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<DialogContent className="sm:max-w-md overflow-y-auto">
					<DialogHeader>
						<DialogTitle>New Stock Request</DialogTitle>
						<DialogDescription>
							Request stock items from another branch or warehouse.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-4 px-4 py-2">
						<div className="flex flex-col gap-1.5">
							<label htmlFor="stock-req-to-branch" className="text-sm font-medium">
								To Branch <span className="text-destructive">*</span>
							</label>
							<BranchCombobox
								id="stock-req-to-branch"
								value={formToBranchId}
								onChange={setFormToBranchId}
								placeholder="Search destination branch..."
								required
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								From Branch{" "}
								<span className="text-muted-foreground text-xs">(optional)</span>
							</label>
							<BranchCombobox
								value={formFromBranchId}
								onChange={setFormFromBranchId}
								placeholder="Search source branch..."
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								Destination Label{" "}
								<span className="text-muted-foreground text-xs">(optional)</span>
							</label>
							<Input
								placeholder="e.g. Main Warehouse"
								value={formDestinationLabel}
								onChange={(e) => setFormDestinationLabel(e.target.value)}
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
									<label htmlFor="stock-req-product-id" className="text-sm font-medium">
										Product ID <span className="text-destructive">*</span>
									</label>
									<Input
										id="stock-req-product-id"
										placeholder="UUID of product"
										value={formProductId}
										onChange={(e) => setFormProductId(e.target.value)}
									/>
								</div>

								<div className="flex flex-col gap-1.5">
									<label htmlFor="stock-req-qty" className="text-sm font-medium">
										Quantity <span className="text-destructive">*</span>
									</label>
									<Input
										id="stock-req-qty"
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
			{/* Fulfill Dialog                                                      */}
			{/* ------------------------------------------------------------------ */}
			<Dialog
				open={fulfillTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setFulfillTarget(null);
						setFulfillQuantities({});
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Fulfill Stock Request</DialogTitle>
						<DialogDescription>
							Enter the quantity fulfilled for each item.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-3 py-2">
						{(fulfillTarget?.items ?? []).map((item) => (
							<div key={item.id} className="flex items-center gap-3">
								<div className="flex-1 text-sm text-muted-foreground truncate">
									<span className="font-medium text-foreground">Product:</span>{" "}
									{item.productId}
									<br />
									<span className="text-xs">Requested: {item.quantityRequested}</span>
								</div>
								<Input
									type="number"
									min="0"
									className="w-24"
									value={fulfillQuantities[item.id] ?? String(item.quantityRequested)}
									onChange={(e) =>
										setFulfillQuantities((prev) => ({
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
								setFulfillTarget(null);
								setFulfillQuantities({});
							}}
							disabled={fulfillMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={handleFulfillConfirm}
							disabled={fulfillMutation.isPending}
						>
							{fulfillMutation.isPending ? "Fulfilling…" : "Confirm Fulfill"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
