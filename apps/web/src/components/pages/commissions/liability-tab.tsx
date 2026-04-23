import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import DataTable from "@/components/tables/sales/view/data-table";
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
import { formatPrice } from "@/lib/currency";
import { client } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";

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

/** Returns ISO datetime string for the start of a YYYY-MM-DD date */
function toIsoStart(dateStr: string): string {
	return new Date(`${dateStr}T00:00:00`).toISOString();
}

/** Returns ISO datetime string for the end of a YYYY-MM-DD date */
function toIsoEnd(dateStr: string): string {
	return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

/** Returns YYYY-MM-DD for the first day of the current month */
function firstOfMonth(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Returns YYYY-MM-DD for today */
function today(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Escape a CSV cell value: wrap in quotes and double any internal quotes.
 * Produces plain RM values (no currency symbol) for amount columns.
 */
function csvCell(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

/** Convert cents to RM decimal string for CSV (no currency symbol) */
function centsToRm(cents: number): string {
	return (cents / 100).toFixed(2);
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
	const queryClient = useQueryClient();

	const canRead = hasPermission("commission_payout:read");
	const canUpdate = hasPermission("commission_payout:update");

	// ── Branch options (derived from userContext, same pattern as all-tab.tsx) ──
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
	const [fromDate, setFromDate] = useState<string>(firstOfMonth());
	const [toDate, setToDate] = useState<string>(today());
	const [hierarchyNodeId, setHierarchyNodeId] = useState<string>("");
	const [categoryId, setCategoryId] = useState<string>("");

	// ── Service categories ─────────────────────────────────────────────────────
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

	// ── Liability summary ──────────────────────────────────────────────────────
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

	// ── Sort by netPayableCents DESC ───────────────────────────────────────────
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

	// ── Row selection ──────────────────────────────────────────────────────────
	const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
		new Set(),
	);

	function toggleRow(memberId: string) {
		setSelectedMemberIds((prev) => {
			const next = new Set(prev);
			if (next.has(memberId)) {
				next.delete(memberId);
			} else {
				next.add(memberId);
			}
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

	// Clear selection when filters change
	function applyFilter(cb: () => void) {
		cb();
		setSelectedMemberIds(new Set());
	}

	// ── Mark as Paid ───────────────────────────────────────────────────────────
	const [markPaidOpen, setMarkPaidOpen] = useState(false);

	const selectedTrainers = sortedTrainers.filter((t) =>
		selectedMemberIds.has(t.memberId),
	);

	const { mutate: markPaidBatch, isPending: isMarkingPaid } = useMutation({
		mutationFn: () =>
			client.commissionSplits.markPaidBatch({
				organizationId: organizationId ?? "",
				memberIds: Array.from(selectedMemberIds),
				from: toIsoStart(fromDate),
				to: toIsoEnd(toDate),
			}),
		onSuccess: (result) => {
			toast.success(
				`Marked ${result.updatedCount} commission split${result.updatedCount !== 1 ? "s" : ""} as paid.`,
			);
			setMarkPaidOpen(false);
			setSelectedMemberIds(new Set());
			// Invalidate all commission-related queries for immediate refresh
			queryClient.invalidateQueries({ queryKey: ["commissionLiability"] });
			queryClient.invalidateQueries({ queryKey: ["commissions"] });
			queryClient.invalidateQueries({ queryKey: ["my-commissions"] });
		},
		onError: (err) => {
			toast.error(
				err instanceof Error
					? err.message
					: "Failed to mark commissions as paid.",
			);
		},
	});

	// ── Columns ────────────────────────────────────────────────────────────────
	const columns: ColumnDef<TrainerLiabilityRow>[] = [
		{
			id: "select",
			header: () => (
				<input
					type="checkbox"
					className="cursor-pointer rounded"
					checked={allSelected}
					onChange={toggleAll}
					aria-label="Select all trainers"
				/>
			),
			cell: ({ row }) => (
				<input
					type="checkbox"
					className="cursor-pointer rounded"
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
				<span className="font-medium text-sm">{row.original.name}</span>
			),
		},
		{
			id: "approvedUnpaidCents",
			header: "Approved (Unpaid)",
			cell: ({ row }) => (
				<span className="text-sm tabular-nums">
					{formatPrice(row.original.approvedUnpaidCents, "MYR")}
				</span>
			),
		},
		{
			id: "paidCents",
			header: "Paid",
			cell: ({ row }) => (
				<span className="text-green-700 text-sm tabular-nums">
					{formatPrice(row.original.paidCents, "MYR")}
				</span>
			),
		},
		{
			id: "manualAdjustmentCents",
			header: "Manual Adj.",
			cell: ({ row }) => (
				<span className="text-sm tabular-nums">
					{formatPrice(row.original.manualAdjustmentCents, "MYR")}
				</span>
			),
		},
		{
			id: "netPayableCents",
			header: "Net Payable",
			cell: ({ row }) => (
				<span className="font-semibold text-sm tabular-nums">
					{formatPrice(row.original.netPayableCents, "MYR")}
				</span>
			),
		},
	];

	// ── Guards ─────────────────────────────────────────────────────────────────
	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view liability summary.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
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
			<div className="flex min-h-96 items-center justify-center text-destructive">
				Failed to load liability summary. Please try again.
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
			{/* Controls */}
			<div className="flex flex-wrap items-end gap-3">
				{/* Date range */}
				<div className="flex flex-col gap-1">
					<Label className="text-xs">From</Label>
					<Input
						type="date"
						value={fromDate}
						onChange={(e) => applyFilter(() => setFromDate(e.target.value))}
						className="h-9 w-40"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<Label className="text-xs">To</Label>
					<Input
						type="date"
						value={toDate}
						onChange={(e) => applyFilter(() => setToDate(e.target.value))}
						className="h-9 w-40"
					/>
				</div>

				{/* Branch filter */}
				{branchOptions.length > 0 && (
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Branch</Label>
						<Select
							value={hierarchyNodeId || "all"}
							onValueChange={(v) =>
								applyFilter(() => setHierarchyNodeId(v === "all" ? "" : v))
							}
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

				{/* Category filter */}
				{categories.length > 0 && (
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Category</Label>
						<Select
							value={categoryId || "all"}
							onValueChange={(v) =>
								applyFilter(() => setCategoryId(v === "all" ? "" : v))
							}
						>
							<SelectTrigger className="h-9 w-48">
								<SelectValue placeholder="All categories" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All categories</SelectItem>
								{categories.map((cat: any) => (
									<SelectItem key={cat.id} value={cat.id}>
										{cat.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{/* Action buttons pushed to end */}
				<div className="ml-auto flex items-end gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={sortedTrainers.length === 0}
						onClick={() =>
							exportToCsv(sortedTrainers, totals, fromDate, toDate)
						}
					>
						Export CSV
					</Button>

					{canUpdate && (
						<Button
							size="sm"
							disabled={selectedMemberIds.size === 0 || isMarkingPaid}
							onClick={() => setMarkPaidOpen(true)}
						>
							Mark as Paid
						</Button>
					)}
				</div>
			</div>

			{/* Table */}
			{sortedTrainers.length === 0 ? (
				<div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed">
					<p className="text-muted-foreground text-sm">
						No commission activity in the selected period.
					</p>
				</div>
			) : (
				<>
					<DataTable<TrainerLiabilityRow, unknown>
						columns={columns}
						data={sortedTrainers}
					/>

					{/* Totals row */}
					<div className="rounded-lg border bg-muted/40 px-4 py-3">
						<div className="grid grid-cols-4 gap-4 text-sm">
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Total Approved (Unpaid)
								</p>
								<p className="mt-0.5 font-semibold tabular-nums">
									{formatPrice(totals.approvedUnpaidCents, "MYR")}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Total Paid
								</p>
								<p className="mt-0.5 font-semibold text-green-700 tabular-nums">
									{formatPrice(totals.paidCents, "MYR")}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Total Manual Adj.
								</p>
								<p className="mt-0.5 font-semibold tabular-nums">
									{formatPrice(totals.manualAdjustmentCents, "MYR")}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Net Payable
								</p>
								<p className="mt-0.5 font-semibold tabular-nums">
									{formatPrice(totals.netPayableCents, "MYR")}
								</p>
							</div>
						</div>
					</div>
				</>
			)}

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
	);
}
