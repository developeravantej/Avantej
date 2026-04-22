import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BulkActionBar } from "@/components/commissions/bulk-action-bar";
import { CopyableCell } from "@/components/tables/copyable-cell";
import DataTable from "@/components/tables/sales/view/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/currency";
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type CommissionStatus = "pending" | "approved" | "paid" | "void";
type ActiveTab = "all" | CommissionStatus;

type CommissionLedgerRow = {
	id: string;
	staffId: string;
	staffName: string;
	appointmentId: string | null;
	salesOrderId: string | null;
	appointmentNumber?: string | null;
	salesOrderNumber?: string | null;
	serviceName?: string | null;
	branchId?: string | null;
	branchName?: string | null;
	splitPercentage: number;
	calculatedAmount: number;
	status: string;
	notes: string | null;
	createdAt: string | Date;
	approvedBy: string | null;
	approvedAt: string | Date | null;
	paidBy: string | null;
	paidAt: string | Date | null;
	payoutId: string | null;
};

type LedgerTotals = {
	pending: number;
	approved: number;
	paid: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_TABS: { value: ActiveTab; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "paid", label: "Paid" },
	{ value: "void", label: "Void" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function CommissionStatusBadge({ status }: { status: string }) {
	const configs: Record<string, { className: string; label: string }> = {
		pending: {
			className:
				"bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100",
			label: "Pending",
		},
		approved: {
			className:
				"bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100",
			label: "Approved",
		},
		paid: {
			className:
				"bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
			label: "Paid",
		},
		void: {
			className:
				"bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100",
			label: "Void",
		},
	};
	const cfg = configs[status] ?? { className: "", label: status };
	return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

// ─── SourceCell ───────────────────────────────────────────────────────────────

function SourceCell({ row }: { row: CommissionLedgerRow }) {
	// Appointment source — no detail route exists, render as plain text
	if (row.appointmentId) {
		const label = row.appointmentNumber
			? `Appointment ${row.appointmentNumber.slice(0, 8)}…`
			: `Appointment ${row.appointmentId.slice(0, 8)}…`;
		return (
			<span className="font-mono text-muted-foreground text-sm">{label}</span>
		);
	}
	// Sales order source — detail route exists at /dashboard/sales/$id
	if (row.salesOrderId) {
		const label = row.salesOrderNumber
			? `Sale ${row.salesOrderNumber}`
			: `Sale ${row.salesOrderId.slice(0, 8)}…`;
		return (
			<Link
				to="/dashboard/sales/$id"
				params={{ id: row.salesOrderId }}
				className="font-mono text-primary text-sm hover:underline"
			>
				{label}
			</Link>
		);
	}
	return <span className="text-muted-foreground">—</span>;
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCard({
	label,
	amountCents,
	colorClass,
}: {
	label: string;
	amountCents: number;
	colorClass: string;
}) {
	return (
		<div className="rounded-lg border bg-card p-4 shadow-sm">
			<p className="text-muted-foreground text-xs uppercase tracking-wide">
				{label}
			</p>
			<p className={`mt-1 font-bold text-2xl tabular-nums ${colorClass}`}>
				{formatPrice(amountCents, "MYR")}
			</p>
		</div>
	);
}

// ─── VoidRowDialog ────────────────────────────────────────────────────────────

function VoidRowDialog({
	open,
	onOpenChange,
	onConfirm,
	isPending,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onConfirm: (reason: string) => void;
	isPending: boolean;
}) {
	const [reason, setReason] = useState("");

	function handleClose() {
		setReason("");
		onOpenChange(false);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) handleClose();
			}}
		>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Void Commission Split</DialogTitle>
					<DialogDescription>
						Provide a required reason — this is recorded in the audit trail.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3 py-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="void-row-reason">
							Reason <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="void-row-reason"
							rows={3}
							placeholder="Explain why this split is being voided…"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={handleClose} disabled={isPending}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={() => {
							if (reason.trim()) onConfirm(reason.trim());
						}}
						disabled={isPending || !reason.trim()}
					>
						{isPending ? "Voiding…" : "Void"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AllCommissionsPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// Permissions
	const canRead = hasPermission("commission_management:read");
	const canApprove = hasPermission("commission_management:approve");
	const canProcess = hasPermission("commission_management:process");

	// ── Branch options ─────────────────────────────────────────────────────────
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const accessibleNodeIds =
		currentOrg?.hierarchy?.member?.accessibleNodeIds ?? [];
	const allNodes = currentOrg?.hierarchy?.nodes ?? [];
	const accessibleBranches = allNodes.filter(
		(n) => accessibleNodeIds.includes(n.id) && n.type === "branch",
	);
	const branchOptions =
		accessibleBranches.length > 0
			? accessibleBranches
			: allNodes.filter((n) => accessibleNodeIds.includes(n.id));

	// ── Filters ────────────────────────────────────────────────────────────────
	const [activeTab, setActiveTab] = useState<ActiveTab>("all");
	const [staffId, setStaffId] = useState("");
	const [branchId, setBranchId] = useState("");
	const [fromInput, setFromInput] = useState("");
	const [toInput, setToInput] = useState("");
	const [fromApplied, setFromApplied] = useState("");
	const [toApplied, setToApplied] = useState("");

	// ── Row selection (managed manually — DataTable has no built-in selection) ──
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	function toggleRow(id: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function isRowSelectable(row: CommissionLedgerRow): boolean {
		if (activeTab === "pending") return row.status === "pending";
		if (activeTab === "approved") return row.status === "approved";
		return false;
	}

	// ── Staff list for combobox ────────────────────────────────────────────────
	const { data: membersData } = useQuery({
		queryKey: ["members-list", organizationId],
		queryFn: () =>
			client.members.list({
				organizationId: organizationId ?? "",
				status: "active",
			}),
		enabled: !!organizationId && canRead,
	});
	// Exclude clients from the staff filter — only admins, trainers, and staff earn commissions
	const staffMembers = ((membersData as any[] | undefined) ?? []).filter(
		(m: any) => m.role !== "client",
	);

	// ── Per-row void state ─────────────────────────────────────────────────────
	const [voidRowId, setVoidRowId] = useState<string | null>(null);
	const [voidDialogOpen, setVoidDialogOpen] = useState(false);
	const [voidingId, setVoidingId] = useState<string | null>(null);

	function handleVoidRow(id: string) {
		setVoidRowId(id);
		setVoidDialogOpen(true);
	}

	async function confirmVoidRow(reason: string) {
		if (!voidRowId || !organizationId) return;
		setVoidingId(voidRowId);
		try {
			await client.commissionSplits.void({
				organizationId,
				id: voidRowId,
				reason,
			});
			toast.success("Commission split voided.");
			queryClient.invalidateQueries({ queryKey: ["commissions"] });
			setVoidDialogOpen(false);
			setVoidRowId(null);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to void commission split.",
			);
		} finally {
			setVoidingId(null);
		}
	}

	// ── Data ───────────────────────────────────────────────────────────────────
	const { data, isLoading, error } = useQuery({
		queryKey: [
			"commissions",
			organizationId,
			activeTab,
			staffId,
			branchId,
			fromApplied,
			toApplied,
		],
		queryFn: async () => {
			if (!organizationId) return { rows: [], total: 0, totals: { pending: 0, approved: 0, paid: 0 } };
			return client.commissionSplits.listLedger({
				organizationId,
				status: activeTab === "all" ? "all" : activeTab,
				staffId: staffId || undefined,
				branchId: branchId || undefined,
				from: fromApplied || undefined,
				to: toApplied || undefined,
				limit: 100,
				offset: 0,
			});
		},
		enabled: !!organizationId && canRead,
	});

	const rows: CommissionLedgerRow[] = (data as any)?.rows ?? [];
	const totals: LedgerTotals = (data as any)?.totals ?? {
		pending: 0,
		approved: 0,
		paid: 0,
	};

	// Reset selection when tab or filters change
	function resetSelection() {
		setSelectedIds(new Set());
	}

	function handleTabChange(tab: ActiveTab) {
		setActiveTab(tab);
		resetSelection();
	}

	// ── Columns ────────────────────────────────────────────────────────────────
	const showSelectionColumn =
		activeTab === "pending" || activeTab === "approved";

	const selectableRows = rows.filter(isRowSelectable);
	const allSelectableSelected =
		selectableRows.length > 0 &&
		selectableRows.every((r) => selectedIds.has(r.id));

	function toggleAllSelectable() {
		if (allSelectableSelected) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(selectableRows.map((r) => r.id)));
		}
	}

	const columns: ColumnDef<CommissionLedgerRow>[] = [
		...(showSelectionColumn
			? [
					{
						id: "select",
						header: () => (
							<input
								type="checkbox"
								className="cursor-pointer rounded"
								checked={allSelectableSelected}
								onChange={toggleAllSelectable}
								aria-label="Select all"
							/>
						),
						cell: ({ row }: { row: { original: CommissionLedgerRow } }) => {
							const r = row.original;
							const selectable = isRowSelectable(r);
							return (
								<input
									type="checkbox"
									className="cursor-pointer rounded disabled:cursor-not-allowed disabled:opacity-30"
									checked={selectedIds.has(r.id)}
									disabled={!selectable}
									onChange={() => {
										if (selectable) toggleRow(r.id);
									}}
									onClick={(e) => e.stopPropagation()}
									aria-label={`Select commission ${r.id}`}
								/>
							);
						},
					} satisfies ColumnDef<CommissionLedgerRow>,
				]
			: []),
		{
			id: "createdAt",
			header: "Date",
			cell: ({ row }) => (
				<span className="whitespace-nowrap text-sm">
					{formatDate(row.original.createdAt)}
				</span>
			),
		},
		{
			id: "staff",
			header: "Staff",
			cell: ({ row }) => (
				<div className="flex flex-col gap-0.5">
					<span className="font-medium text-sm">{row.original.staffName}</span>
					<CopyableCell
						value={row.original.staffId}
						displayText={`${row.original.staffId.slice(0, 8)}…`}
					/>
				</div>
			),
		},
		{
			id: "source",
			header: "Source",
			cell: ({ row }) => <SourceCell row={row.original} />,
		},
		{
			id: "service",
			header: "Service",
			cell: ({ row }) => (
				<span className="text-sm">
					{row.original.serviceName ?? (
						<span className="text-muted-foreground">—</span>
					)}
				</span>
			),
		},
		{
			id: "branch",
			header: "Branch",
			cell: ({ row }) => (
				<span className="text-muted-foreground text-sm">
					{row.original.branchName ?? "—"}
				</span>
			),
		},
		{
			id: "splitPercentage",
			header: "Split %",
			cell: ({ row }) => (
				<span className="tabular-nums text-sm">
					{row.original.splitPercentage}%
				</span>
			),
		},
		{
			id: "calculatedAmount",
			header: "Amount",
			cell: ({ row }) => (
				<span className="font-medium tabular-nums text-sm">
					{formatPrice(row.original.calculatedAmount, "MYR")}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => (
				<CommissionStatusBadge status={row.original.status} />
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const r = row.original;
				const isVoid = r.status === "void";
				if (isVoid || !canApprove) return null;
				return (
					<Button
						size="sm"
						variant="outline"
						className="border-destructive/40 text-destructive hover:bg-destructive/5"
						onClick={(e) => {
							e.stopPropagation();
							handleVoidRow(r.id);
						}}
						disabled={voidingId === r.id}
					>
						Void
					</Button>
				);
			},
		},
	];

	// ── Guards ─────────────────────────────────────────────────────────────────
	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view commissions.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm">
						You don't have permission to view commission splits.
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		const isForbidden =
			error instanceof Error &&
			(error.message.includes("403") ||
				error.message.toLowerCase().includes("forbidden") ||
				error.message.toLowerCase().includes("permission"));
		if (isForbidden) {
			return (
				<div className="flex min-h-96 items-center justify-center text-muted-foreground">
					<div className="space-y-2 text-center">
						<p className="font-medium">Permission Denied</p>
						<p className="text-sm">
							You don't have permission to view commission splits.
						</p>
					</div>
				</div>
			);
		}
		return (
			<div className="flex min-h-96 items-center justify-center text-destructive">
				Failed to load commissions. Please try again.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex min-h-96 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-r-transparent">
					<span className="sr-only">Loading…</span>
				</div>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────────
	return (
		<div className="space-y-6">
			{/* KPI Strip */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<KpiCard
					label="Pending Total"
					amountCents={totals.pending}
					colorClass="text-yellow-700"
				/>
				<KpiCard
					label="Approved Total"
					amountCents={totals.approved}
					colorClass="text-blue-700"
				/>
				<KpiCard
					label="Paid Total"
					amountCents={totals.paid}
					colorClass="text-green-700"
				/>
			</div>

			{/* Status Tabs */}
			<div className="flex items-center gap-1 border-b">
				{STATUS_TABS.map((tab) => {
					const isActive = activeTab === tab.value;
					return (
						<button
							key={tab.value}
							type="button"
							onClick={() => handleTabChange(tab.value)}
							className={`border-b-2 px-4 py-2 font-medium text-sm transition-colors ${
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:border-muted hover:text-foreground"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Filters */}
			<div className="flex flex-wrap items-end gap-3">
				{/* Staff combobox */}
				{staffMembers.length > 0 && (
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Staff</Label>
						<Select
							value={staffId || "all"}
							onValueChange={(v) => {
								setStaffId(v === "all" ? "" : v);
								resetSelection();
							}}
						>
							<SelectTrigger className="h-9 w-52">
								<SelectValue placeholder="All staff" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All staff</SelectItem>
								{staffMembers.map((m: any) => (
									<SelectItem key={m.id} value={m.id}>
										{m.name ?? m.email ?? m.id.slice(0, 8)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{/* Branch combobox */}
				{branchOptions.length > 0 && (
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Branch</Label>
						<Select
							value={branchId || "all"}
							onValueChange={(v) => {
								setBranchId(v === "all" ? "" : v);
								resetSelection();
							}}
						>
							<SelectTrigger className="h-9 w-48">
								<SelectValue placeholder="All branches" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All branches</SelectItem>
								{branchOptions.map((node) => (
									<SelectItem key={node.id} value={node.id}>
										{node.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{/* Date range */}
				<div className="flex flex-col gap-1">
					<Label className="text-xs">From</Label>
					<Input
						type="date"
						value={fromInput}
						onChange={(e) => setFromInput(e.target.value)}
						onBlur={() => {
							setFromApplied(fromInput);
							resetSelection();
						}}
						className="h-9 w-40"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<Label className="text-xs">To</Label>
					<Input
						type="date"
						value={toInput}
						onChange={(e) => setToInput(e.target.value)}
						onBlur={() => {
							setToApplied(toInput);
							resetSelection();
						}}
						className="h-9 w-40"
					/>
				</div>

				{/* Clear filters */}
				{(staffId || branchId || fromApplied || toApplied) && (
					<Button
						variant="ghost"
						size="sm"
						className="h-9 self-end"
						onClick={() => {
							setStaffId("");
							setBranchId("");
							setFromInput("");
							setToInput("");
							setFromApplied("");
							setToApplied("");
							resetSelection();
						}}
					>
						Clear filters
					</Button>
				)}
			</div>

			{/* Bulk Action Bar */}
			{selectedIds.size > 0 && organizationId && (
				<BulkActionBar
					selectedIds={Array.from(selectedIds)}
					tab={activeTab}
					organizationId={organizationId}
					canApprove={canApprove}
					canProcess={canProcess}
					onDone={resetSelection}
				/>
			)}

			{/* Table */}
			<DataTable<CommissionLedgerRow, unknown>
				columns={columns}
				data={rows}
			/>

			{/* Per-row void dialog */}
			<VoidRowDialog
				open={voidDialogOpen}
				onOpenChange={(o) => {
					setVoidDialogOpen(o);
					if (!o) setVoidRowId(null);
				}}
				onConfirm={confirmVoidRow}
				isPending={voidingId !== null}
			/>
		</div>
	);
}
