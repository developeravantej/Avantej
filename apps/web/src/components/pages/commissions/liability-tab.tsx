import { useQuery } from "@tanstack/react-query";
import { StatusCallout } from "@/components/ui/status-callout";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import DataTable from "@/components/tables/sales/view/data-table";
import { useApiMutation } from "@/hooks/useApiMutation";
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
import { useUserContext } from "@/hooks/useUserContext";
import { centsToRm, formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { payoutKeys } from "@/features/payouts/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type TrainerLiabilityRow = {
	memberId: string;
	name: string;
	approvedUnpaidCents: number;
	paidCents: number;
	manualAdjustmentCents: number;
	netPayableCents: number;
};

type LiabilitySummaryOutput = {
	trainers: TrainerLiabilityRow[];
	totals: {
		approvedUnpaidCents: number;
		paidCents: number;
		manualAdjustmentCents: number;
		netPayableCents: number;
	};
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIsoStart(dateStr: string): string {
	return new Date(`${dateStr}T00:00:00`).toISOString();
}

function toIsoEnd(dateStr: string): string {
	return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

function firstOfMonth(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function csvCell(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportToCsv(
	rows: TrainerLiabilityRow[],
	totals: LiabilitySummaryOutput["totals"],
	from: string,
	to: string,
): void {
	const header = [
		"Trainer",
		"Approved Unpaid (RM)",
		"Paid (RM)",
		"Manual Adj (RM)",
		"Net Payable (RM)",
	]
		.map(csvCell)
		.join(",");

	const dataRows = rows.map((r) =>
		[
			csvCell(r.name),
			csvCell(centsToRm(r.approvedUnpaidCents)),
			csvCell(centsToRm(r.paidCents)),
			csvCell(centsToRm(r.manualAdjustmentCents)),
			csvCell(centsToRm(r.netPayableCents)),
		].join(","),
	);

	const totalsRow = [
		csvCell("TOTALS"),
		csvCell(centsToRm(totals.approvedUnpaidCents)),
		csvCell(centsToRm(totals.paidCents)),
		csvCell(centsToRm(totals.manualAdjustmentCents)),
		csvCell(centsToRm(totals.netPayableCents)),
	].join(",");

	const csv = [header, ...dataRows, totalsRow].join("\n");
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `commission-liability_${from}_${to}.csv`;
	a.click();
	URL.revokeObjectURL(url);
}

// ─── Mark as Paid Dialog ──────────────────────────────────────────────────────

function MarkPaidDialog({
	open,
	onOpenChange,
	selectedTrainers,
	from,
	to,
	onConfirm,
	isPending,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	selectedTrainers: TrainerLiabilityRow[];
	from: string;
	to: string;
	onConfirm: () => void;
	isPending: boolean;
}) {
	const displayedTrainers = selectedTrainers.slice(0, 5);
	const overflow = selectedTrainers.length - 5;
	const trainerPreview =
		displayedTrainers.map((t) => t.name).join(", ") +
		(overflow > 0 ? `, ... and ${overflow} more` : "");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Mark Commission as Paid</DialogTitle>
					<DialogDescription>
						You are about to mark commission splits for{" "}
						<strong>
							{selectedTrainers.length} trainer
							{selectedTrainers.length !== 1 ? "s" : ""}
						</strong>{" "}
						as paid: {trainerPreview}. This will affect all{" "}
						<strong>approved</strong> splits in {from} – {to}.{" "}
						<strong>This action cannot be undone.</strong>
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button onClick={onConfirm} disabled={isPending}>
						{isPending ? "Marking…" : "Confirm"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LiabilityTab() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const canRead = hasPermission("commission_payout:read");
	const canUpdate = hasPermission("commission_payout:update");

	// Branch options
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

	// Filters
	const [fromDate, setFromDate] = useState<string>(firstOfMonth());
	const [toDate, setToDate] = useState<string>(today());
	const [hierarchyNodeId, setHierarchyNodeId] = useState<string>("");
	const [categoryId, setCategoryId] = useState<string>("");

	// Service categories
	const { data: categoriesData } = useQuery({
		queryKey: ["service-categories-list", organizationId],
		queryFn: () =>
			client.serviceCategories.list({
				organizationId: organizationId ?? "",
				isActive: true,
			}),
		enabled: !!organizationId && canRead,
	});
	const categories = categoriesData ?? [];

	// Liability summary
	const queryKey = [
		"commissionLiability",
		{ from: fromDate, to: toDate, hierarchyNodeId, categoryId },
	] as const;

	const { data, isLoading, error } = useQuery({
		queryKey,
		queryFn: async () => {
			if (!organizationId) return null;
			return client.commissionSplits.liabilitySummary({
				organizationId,
				from: toIsoStart(fromDate),
				to: toIsoEnd(toDate),
				hierarchyNodeId: hierarchyNodeId || undefined,
				categoryId: categoryId || undefined,
			});
		},
		enabled: !!organizationId && canRead && !!fromDate && !!toDate,
	});

	const sortedTrainers = useMemo<TrainerLiabilityRow[]>(() => {
		const trainers = (data as LiabilitySummaryOutput | null)?.trainers ?? [];
		return [...trainers].sort((a, b) => b.netPayableCents - a.netPayableCents);
	}, [data]);

	const totals = (data as LiabilitySummaryOutput | null)?.totals ?? {
		approvedUnpaidCents: 0,
		paidCents: 0,
		manualAdjustmentCents: 0,
		netPayableCents: 0,
	};

	// Row selection
	const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
		new Set(),
	);

	function toggleRow(memberId: string) {
		setSelectedMemberIds((prev) => {
			const next = new Set(prev);
			if (next.has(memberId)) next.delete(memberId);
			else next.add(memberId);
			return next;
		});
	}

	const allSelected =
		sortedTrainers.length > 0 &&
		sortedTrainers.every((t) => selectedMemberIds.has(t.memberId));

	function toggleAll() {
		if (allSelected) {
			setSelectedMemberIds(new Set());
		} else {
			setSelectedMemberIds(new Set(sortedTrainers.map((t) => t.memberId)));
		}
	}

	function applyFilter(cb: () => void) {
		cb();
		setSelectedMemberIds(new Set());
	}

	// Mark as Paid
	const [markPaidOpen, setMarkPaidOpen] = useState(false);
	const selectedTrainers = sortedTrainers.filter((t) =>
		selectedMemberIds.has(t.memberId),
	);

	const { mutate: markPaidBatch, isPending: isMarkingPaid } = useApiMutation({
		mutationFn: () =>
			client.commissionSplits.markPaidBatch({
				organizationId: organizationId ?? "",
				memberIds: Array.from(selectedMemberIds),
				from: toIsoStart(fromDate),
				to: toIsoEnd(toDate),
			}),
		successMessage: (result) =>
			`Marked ${result.updatedCount} commission split${result.updatedCount !== 1 ? "s" : ""} as paid.`,
		errorMessage: (err) => err.message || "Failed to mark commissions as paid.",
		invalidate: [
			["commissionLiability"],
			["commissions"],
			["my-commissions"],
			// F-PAY-1: invalidate payouts list so Payouts tab refreshes after markPaidBatch
			payoutKeys.list(organizationId ?? ""),
		],
		onSuccess: () => {
			setMarkPaidOpen(false);
			setSelectedMemberIds(new Set());
		},
	});

	// Columns
	const columns: ColumnDef<TrainerLiabilityRow>[] = [
		{
			id: "select",
			header: () => (
				<input
					type="checkbox"
					className="cursor-pointer rounded"
					style={{ width: 15, height: 15, accentColor: "#000" }}
					checked={allSelected}
					onChange={toggleAll}
					aria-label="Select all trainers"
				/>
			),
			cell: ({ row }) => (
				<input
					type="checkbox"
					className="cursor-pointer rounded"
					style={{ width: 15, height: 15, accentColor: "#000" }}
					checked={selectedMemberIds.has(row.original.memberId)}
					onChange={() => toggleRow(row.original.memberId)}
					onClick={(e) => e.stopPropagation()}
					aria-label={`Select ${row.original.name}`}
				/>
			),
		},
		{
			id: "name",
			header: "Trainer",
			cell: ({ row }) => (
				<span className="font-medium text-sm text-[#0a0a0a]">{row.original.name}</span>
			),
		},
		{
			id: "approvedUnpaidCents",
			header: "Approved (Unpaid)",
			cell: ({ row }) => (
				<span className="text-sm tabular-nums font-mono">
					{formatPrice(row.original.approvedUnpaidCents, "MYR")}
				</span>
			),
		},
		{
			id: "paidCents",
			header: "Paid",
			cell: ({ row }) => (
				<span className="text-sm tabular-nums font-mono text-[#15803d]">
					{formatPrice(row.original.paidCents, "MYR")}
				</span>
			),
		},
		{
			id: "manualAdjustmentCents",
			header: "Manual Adj.",
			cell: ({ row }) => (
				<span className="text-sm tabular-nums font-mono">
					{formatPrice(row.original.manualAdjustmentCents, "MYR")}
				</span>
			),
		},
		{
			id: "netPayableCents",
			header: "Net Payable",
			cell: ({ row }) => (
				<span className="font-semibold text-sm tabular-nums font-mono">
					{formatPrice(row.original.netPayableCents, "MYR")}
				</span>
			),
		},
	];

	// Guards
	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-[#6b7170]">
				Select an organization to view liability summary.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center text-[#6b7170]">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm">
						You don't have permission to view commission liability.
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-6">
				<StatusCallout variant="error" onRetry={() => {}}>
					Failed to load liability summary. Please try again.
				</StatusCallout>
			</div>
		);
	}

	// Render
	return (
		<Skeleton name="commissions-liability-tab" loading={isLoading} fallback={<PageLoader />}>
		<div className="px-6 pb-6">
			{/* KPI band */}
			<div className="mb-4 grid grid-cols-4 gap-4">
				{[
					{ label: "Approved (Unpaid)", val: totals.approvedUnpaidCents, color: "" },
					{ label: "Paid", val: totals.paidCents, color: "text-[#1d4ed8]" },
					{ label: "Manual Adj.", val: totals.manualAdjustmentCents, color: "" },
					{ label: "Net Payable", val: totals.netPayableCents, color: "" },
				].map((kpi) => (
					<div
						key={kpi.label}
						className="rounded-2xl border border-[#e5e5e5] bg-white px-5 py-4"
					>
						<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							{kpi.label}
						</div>
						<div
							className={`mt-1 font-mono text-2xl font-bold tabular-nums text-[#0a0a0a] ${kpi.color}`}
						>
							{formatPrice(kpi.val, "MYR")}
						</div>
					</div>
				))}
			</div>

			{/* Main card */}
			<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				{/* Toolbar */}
				<div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-3">
					<span className="text-sm font-semibold text-[#0a0a0a]">
						Liability by Trainer
					</span>
					<div className="flex items-center gap-2">
						{/* Date range */}
						<div className="flex items-center gap-2">
							<Label className="text-xs text-[#6b7170]">From</Label>
							<Input
								type="date"
								value={fromDate}
								onChange={(e) => applyFilter(() => setFromDate(e.target.value))}
								className="h-8 w-36 text-xs"
							/>
						</div>
						<div className="flex items-center gap-2">
							<Label className="text-xs text-[#6b7170]">To</Label>
							<Input
								type="date"
								value={toDate}
								onChange={(e) => applyFilter(() => setToDate(e.target.value))}
								className="h-8 w-36 text-xs"
							/>
						</div>

						{/* Branch filter */}
						{branchOptions.length > 0 && (
							<Select
								value={hierarchyNodeId || "all"}
								onValueChange={(v) =>
									applyFilter(() => setHierarchyNodeId(v === "all" ? "" : v))
								}
							>
								<SelectTrigger className="h-8 w-40 text-xs">
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
						)}

						{/* Category filter */}
						{categories.length > 0 && (
							<Select
								value={categoryId || "all"}
								onValueChange={(v) =>
									applyFilter(() => setCategoryId(v === "all" ? "" : v))
								}
							>
								<SelectTrigger className="h-8 w-40 text-xs">
									<SelectValue placeholder="All categories" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All categories</SelectItem>
									{categories.map((cat) => (
										<SelectItem key={cat.id} value={cat.id}>
											{cat.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}

						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-[14px] py-[8px] text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-40"
							disabled={sortedTrainers.length === 0}
							onClick={() => exportToCsv(sortedTrainers, totals, fromDate, toDate)}
						>
							Export CSV
						</button>
					</div>
				</div>

				{/* Table */}
				{sortedTrainers.length === 0 ? (
					<div className="flex min-h-48 items-center justify-center text-sm text-[#6b7170]">
						No commission activity in the selected period.
					</div>
				) : (
					<DataTable<TrainerLiabilityRow, unknown>
						columns={columns}
						data={sortedTrainers}
					/>
				)}

				{/* Footer */}
				<div className="flex items-center justify-between border-t border-[#e5e5e5] px-6 py-4">
					<span className="text-xs text-[#6b7170]">
						{sortedTrainers.length} trainer{sortedTrainers.length !== 1 ? "s" : ""} ·{" "}
						{fromDate} to {toDate}
					</span>
					{canUpdate && (
						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] px-[14px] py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
							disabled={selectedMemberIds.size === 0 || isMarkingPaid}
							onClick={() => setMarkPaidOpen(true)}
						>
							Mark as Paid
							{selectedMemberIds.size > 0 && ` · ${selectedMemberIds.size} trainer${selectedMemberIds.size !== 1 ? "s" : ""}`}
						</button>
					)}
				</div>
			</div>

			{/* Mark as Paid confirmation dialog */}
			<MarkPaidDialog
				open={markPaidOpen}
				onOpenChange={setMarkPaidOpen}
				selectedTrainers={selectedTrainers}
				from={fromDate}
				to={toDate}
				onConfirm={() => markPaidBatch()}
				isPending={isMarkingPaid}
			/>
		</div>
		</Skeleton>
	);
}
