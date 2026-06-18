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
import { formatPrice } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Row type from liabilitySummary.trainers — Phase 4: now includes byRoleType.
 */
type TrainerLiabilityRow = {
	memberId: string;
	name: string;
	approvedUnpaidCents: number;
	paidCents: number;
	manualAdjustmentCents: number;
	netPayableCents: number;
	/** Breakdown of approvedUnpaidCents by roleType. NULL roleType → "delivery_legacy". */
	byRoleType: Record<string, number>;
};

type LiabilitySummaryOutput = {
	trainers: TrainerLiabilityRow[];
	totals: {
		approvedUnpaidCents: number;
		paidCents: number;
		manualAdjustmentCents: number;
		netPayableCents: number;
		byRoleType: Record<string, number>;
	};
};

// Role types as accepted by the backend filter
type RoleTypeFilter =
	| "trainer"
	| "sales"
	| "marketing"
	| "referrer"
	| "delivery_legacy";

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

/**
 * Human-readable label for a roleType key (including "delivery_legacy" = NULL rows).
 */
function roleTypeLabel(roleType: string): string {
	const labels: Record<string, string> = {
		trainer: "Trainer",
		sales: "Sales",
		marketing: "Marketing",
		referrer: "Referral",
		delivery_legacy: "Delivery (legacy)",
	};
	return labels[roleType] ?? roleType;
}

// ─── Role Breakdown Badge ─────────────────────────────────────────────────────

function RoleBreakdown({ byRoleType }: { byRoleType: Record<string, number> }) {
	const entries = Object.entries(byRoleType).filter(([, v]) => v > 0);
	if (entries.length === 0)
		return <span className="text-xs text-[#a3a3a3]">—</span>;

	return (
		<div className="flex flex-wrap gap-1">
			{entries.map(([role, cents]) => (
				<span
					key={role}
					className="inline-flex items-center gap-1 rounded-full bg-[#f3f3f3] px-2 py-0.5 text-[11px] font-medium text-[#4a4f51]"
					title={`${roleTypeLabel(role)}: ${formatPrice(cents, "MYR")}`}
				>
					<span className="text-[#8a8f91]">{roleTypeLabel(role)}</span>
					<span className="font-mono tabular-nums">
						{formatPrice(cents, "MYR")}
					</span>
				</span>
			))}
		</div>
	);
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
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						COMMISSION SUMMARY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Mark Commission as Paid
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						You are about to mark commission splits for{" "}
						<strong>
							{selectedTrainers.length} staff member
							{selectedTrainers.length !== 1 ? "s" : ""}
						</strong>{" "}
						as paid: {trainerPreview}. This will affect all{" "}
						<strong>approved</strong> splits in {from} – {to}.{" "}
						<strong>This action cannot be undone.</strong>
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={onConfirm}
						disabled={isPending}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
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

	// ── State — declare ALL useState before any conditional hook ──────────────
	const [fromDate, setFromDate] = useState<string>(firstOfMonth());
	const [toDate, setToDate] = useState<string>(today());
	const [hierarchyNodeId, setHierarchyNodeId] = useState<string>("");
	const [categoryId, setCategoryId] = useState<string>("");
	// Phase 4: role/track filters
	const [roleTypeFilter, setRoleTypeFilter] = useState<RoleTypeFilter | "">("");
	const [trackIdFilter, setTrackIdFilter] = useState<string>("");
	const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
		new Set(),
	);
	const [markPaidOpen, setMarkPaidOpen] = useState(false);
	const [isExporting, setIsExporting] = useState(false);

	// Service categories
	const { data: categoriesData } = useQuery({
		...orpc.serviceCategories.list.queryOptions({
			input: { organizationId: organizationId!, isActive: true },
		}),
		enabled: !!organizationId && canRead,
	});
	const categories = categoriesData ?? [];

	// Phase 4: track filter is exposed as a UUID text input (tracks are per-category;
	// no global track list endpoint exists). trackIdFilter holds a raw UUID string.
	// (tracksData intentionally omitted — no global listing API)

	// Liability summary (liabilitySummary aggregates per-staff with byRoleType)
	const { data, isLoading, error } = useQuery({
		...orpc.commissionSplits.liabilitySummary.queryOptions({
			input: {
				organizationId: organizationId!,
				from: toIsoStart(fromDate),
				to: toIsoEnd(toDate),
				hierarchyNodeId: hierarchyNodeId || undefined,
				categoryId: categoryId || undefined,
				// Phase 4: optional track / role filters
				trackId: trackIdFilter || undefined,
				roleType: (roleTypeFilter || undefined) as RoleTypeFilter | undefined,
			},
		}),
		enabled: !!organizationId && canRead && !!fromDate && !!toDate,
	});

	const typedData = data as LiabilitySummaryOutput | null;

	const sortedTrainers = useMemo<TrainerLiabilityRow[]>(() => {
		const trainers = typedData?.trainers ?? [];
		return [...trainers].sort((a, b) => b.netPayableCents - a.netPayableCents);
	}, [typedData]);

	const totals = typedData?.totals ?? {
		approvedUnpaidCents: 0,
		paidCents: 0,
		manualAdjustmentCents: 0,
		netPayableCents: 0,
		byRoleType: {},
	};

	// ── Helpers ───────────────────────────────────────────────────────────────

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

	// ── CSV export via backend procedure ─────────────────────────────────────
	// Phase 4: delegate to exportLiabilityCsv — single source of truth for headers.
	// Backend headers: "Staff Member","Role","Track ID","Approved Unpaid (RM)","Paid (RM)","Manual Adj (RM)","Net Payable (RM)"
	// Cast via unknown: the procedure exists in source (analytics.procedures.ts) but
	// the @avantej-core/api dist/ was not yet rebuilt after Phase 4 additions. The
	// runtime call will succeed once the package is rebuilt. See CLAUDE.md: stale dist.
	async function handleExportCsv() {
		if (!organizationId) return;
		setIsExporting(true);
		try {
			const result = await client.commissionSplits.exportLiabilityCsv({
				organizationId,
				from: toIsoStart(fromDate),
				to: toIsoEnd(toDate),
				hierarchyNodeId: hierarchyNodeId || undefined,
				categoryId: categoryId || undefined,
				trackId: trackIdFilter || undefined,
				roleType: (roleTypeFilter || undefined) as RoleTypeFilter | undefined,
			});
			const { csv } = result as { csv: string; rowCount: number };
			const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `commission-liability_${fromDate}_${toDate}.csv`;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			// Silently fail — user can retry
		} finally {
			setIsExporting(false);
		}
	}

	// ── Mark as Paid ──────────────────────────────────────────────────────────
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
			orpc.commissionSplits.liabilitySummary.key(),
			orpc.commissionSplits.listLedger.key(),
			orpc.commissionSplits.getMyCommissions.key(),
			// F-PAY-1: invalidate payouts list so Payouts tab refreshes after markPaidBatch
			[["payouts", "list"]],
		],
		onSuccess: () => {
			setMarkPaidOpen(false);
			setSelectedMemberIds(new Set());
		},
	});

	// ── Columns ───────────────────────────────────────────────────────────────
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
					aria-label="Select all staff"
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
			header: "Staff Member",
			cell: ({ row }) => (
				<span className="font-medium text-sm text-[#0a0a0a]">
					{row.original.name}
				</span>
			),
		},
		{
			id: "byRoleType",
			header: "By Role",
			cell: ({ row }) => <RoleBreakdown byRoleType={row.original.byRoleType} />,
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

	// ── Guards ────────────────────────────────────────────────────────────────
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

	// ── Totals byRoleType breakdown (for KPI band annotation) ────────────────
	const roleTypeTotals = Object.entries(totals.byRoleType).filter(
		([, v]) => v > 0,
	);

	// ── Render ────────────────────────────────────────────────────────────────
	return (
		<Skeleton
			name="commissions-liability-tab"
			loading={isLoading}
			fallback={<PageLoader />}
		>
			<div className="px-6 pb-6">
				{/* KPI band */}
				<div className="mb-4 grid grid-cols-4 gap-4">
					{[
						{
							label: "Approved (Unpaid)",
							val: totals.approvedUnpaidCents,
							color: "",
						},
						{ label: "Paid", val: totals.paidCents, color: "text-[#1d4ed8]" },
						{
							label: "Manual Adj.",
							val: totals.manualAdjustmentCents,
							color: "",
						},
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

				{/* Phase 4: byRoleType totals band — only shown when there is more than one role */}
				{roleTypeTotals.length > 1 && (
					<div className="mb-4 flex flex-wrap gap-2">
						{roleTypeTotals.map(([role, cents]) => (
							<div
								key={role}
								className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 py-2"
							>
								<span className="text-xs font-semibold text-[#737373]">
									{roleTypeLabel(role)}
								</span>
								<span className="font-mono text-sm font-bold tabular-nums text-[#0a0a0a]">
									{formatPrice(cents, "MYR")}
								</span>
							</div>
						))}
					</div>
				)}

				{/* Main card */}
				<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
					{/* Toolbar */}
					<div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e5e5] px-6 py-3">
						<span className="text-sm font-semibold text-[#0a0a0a]">
							Liability by Staff Member
						</span>
						<div className="flex flex-wrap items-center gap-2">
							{/* Date range */}
							<div className="flex items-center gap-2">
								<Label className="text-xs text-[#6b7170]">From</Label>
								<Input
									type="date"
									value={fromDate}
									onChange={(e) =>
										applyFilter(() => setFromDate(e.target.value))
									}
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

							{/* Phase 4: Role type filter */}
							<Select
								value={roleTypeFilter || "all"}
								onValueChange={(v) =>
									applyFilter(() =>
										setRoleTypeFilter(v === "all" ? "" : (v as RoleTypeFilter)),
									)
								}
							>
								<SelectTrigger
									className="h-8 w-44 text-xs"
									data-testid="role-type-filter"
								>
									<SelectValue placeholder="All roles" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All roles</SelectItem>
									<SelectItem value="trainer">Trainer</SelectItem>
									<SelectItem value="sales">Sales</SelectItem>
									<SelectItem value="marketing">Marketing</SelectItem>
									<SelectItem value="referrer">Referral</SelectItem>
									<SelectItem value="delivery_legacy">
										Delivery (legacy)
									</SelectItem>
								</SelectContent>
							</Select>

							{/* Phase 4: Track ID filter — accepts a raw UUID (tracks are category-scoped;
						    no global listing endpoint). Clear the field to remove the filter. */}
							<Input
								type="text"
								placeholder="Track UUID…"
								value={trackIdFilter}
								onChange={(e) =>
									applyFilter(() => setTrackIdFilter(e.target.value.trim()))
								}
								className="h-8 w-40 font-mono text-xs"
								data-testid="track-id-filter"
								title="Filter by commission track UUID (leave blank for all tracks)"
							/>

							{/* Phase 4: Export CSV via backend procedure */}
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-[14px] py-[8px] text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-40"
								disabled={sortedTrainers.length === 0 || isExporting}
								onClick={handleExportCsv}
							>
								{isExporting ? "Exporting…" : "Export CSV"}
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
							{sortedTrainers.length} staff member
							{sortedTrainers.length !== 1 ? "s" : ""} · {fromDate} to {toDate}
							{roleTypeFilter && ` · ${roleTypeLabel(roleTypeFilter)}`}
						</span>
						{canUpdate && (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] px-[14px] py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
								disabled={selectedMemberIds.size === 0 || isMarkingPaid}
								onClick={() => setMarkPaidOpen(true)}
							>
								Mark as Paid
								{selectedMemberIds.size > 0 &&
									` · ${selectedMemberIds.size} member${selectedMemberIds.size !== 1 ? "s" : ""}`}
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
