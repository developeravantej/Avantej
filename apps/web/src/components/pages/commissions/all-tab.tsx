import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BulkActionBar } from "@/components/commissions/bulk-action-bar";
import {
	StatusBadge,
	type CanonicalStatus,
} from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { client, orpc } from "@/utils/orpc";
import { useScope } from "@/components/scope/ScopeProvider";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";

// ─── Types ────────────────────────────────────────────────────────────────────

type CommissionStatus = "pending" | "approved" | "paid" | "void";
type ActiveTab = "all" | CommissionStatus;

type CommissionLedgerRow = {
	id: string;
	staffId: string;
	staffName: string | null;
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
	earnReason?: string | null;
};

type LedgerTotals = {
	pending: number;
	approved: number;
	paid: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

function initials(name: string | null | undefined): string {
	if (!name) return "?";
	return name
		.split(" ")
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

function statusBadgeClass(status: string): string {
	switch (status) {
		case "approved":
			return "bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]";
		case "paid":
			return "bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]";
		case "void":
			return "bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca]";
		default:
			return "bg-white text-[#4a4f51] border border-[#e5e5e5]";
	}
}

function StatusPill({ status }: { status: string }) {
	return (
		<span
			className={`inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-medium leading-[1.4] ${statusBadgeClass(status)}`}
		>
			{status}
		</span>
	);
}

// ─── SourceCell ───────────────────────────────────────────────────────────────

function SourceCell({ row }: { row: CommissionLedgerRow }) {
	if (row.appointmentId) {
		const label = row.appointmentNumber
			? `Appt ${row.appointmentNumber.slice(0, 8)}…`
			: `Appt ${row.appointmentId.slice(0, 8)}…`;
		return <span className="font-mono text-[#6b7170] text-xs">{label}</span>;
	}
	if (row.salesOrderId) {
		const label = row.salesOrderNumber
			? `Sale ${row.salesOrderNumber}`
			: `Sale ${row.salesOrderId.slice(0, 8)}…`;
		return (
			<Link
				to="/dashboard/sales/$id"
				params={{ id: row.salesOrderId }}
				className="font-mono text-xs text-[#1d4ed8] hover:underline"
			>
				{label}
			</Link>
		);
	}
	return <span className="text-[#6b7170]">—</span>;
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
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						COMMISSION SUMMARY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Void Commission Split
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Provide a required reason — this is recorded in the audit trail.
					</DialogDescription>
				</DialogHeader>
				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="void-row-reason">
								Reason <span className="text-rose-600">*</span>
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
				</div>
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={handleClose} disabled={isPending}>
						Cancel
					</Button>
					<Button
						className="bg-red-600 hover:bg-red-700 text-white"
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

// ─── Staff entry in sidebar ───────────────────────────────────────────────────

type StaffSummary = {
	staffId: string;
	staffName: string | null;
	pendingTotal: number;
	pendingCount: number;
	dominantStatus: string;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function AllCommissionsPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// Tenant scope switcher → narrows the ledger query within the caller's RBAC
	// subtree. `scopeNodeId` is undefined at "All" (server expands to the full
	// accessible subtree), else the selected hierarchy node id.
	const { scopeNodeId } = useScope();

	// Permissions
	const canRead = hasPermission("commission_management:read");
	const canApprove = hasPermission("commission_management:approve");
	const canProcess = hasPermission("commission_management:process");

	// ── Filters ────────────────────────────────────────────────────────────────
	const [activeTab, setActiveTab] = useState<ActiveTab>("all");
	const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
	const [staffSearch, setStaffSearch] = useState("");

	// ── Row selection ──────────────────────────────────────────────────────────
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	function toggleRow(id: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function isRowSelectable(row: CommissionLedgerRow): boolean {
		if (activeTab === "pending") return row.status === "pending";
		if (activeTab === "approved") return row.status === "approved";
		return false;
	}

	function resetSelection() {
		setSelectedIds(new Set());
	}

	// ── Per-row void ───────────────────────────────────────────────────────────
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
			await client.commissionSplits.voidById({
				organizationId,
				id: voidRowId,
				reason,
			});
			toast.success("Commission split voided.");
			queryClient.invalidateQueries({
				queryKey: orpc.commissionSplits.listLedger.key(),
			});
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
	const { data, isLoading, isError, refetch } = useQuery({
		...orpc.commissionSplits.listLedger.queryOptions({
			input: {
				organizationId: organizationId!,
				status: activeTab === "all" ? "all" : activeTab,
				staffId: selectedStaffId || undefined,
				branchId: scopeNodeId,
				limit: 200,
				offset: 0,
			},
		}),
		enabled: !!organizationId && canRead,
	});

	const rows: CommissionLedgerRow[] = data?.rows ?? [];
	const totals: LedgerTotals = data?.totals ?? {
		pending: 0,
		approved: 0,
		paid: 0,
	};

	// ── Derive staff list from rows ────────────────────────────────────────────
	const staffMap = new Map<string, StaffSummary>();
	for (const row of rows) {
		const existing = staffMap.get(row.staffId);
		const isPending = row.status === "pending";
		if (!existing) {
			staffMap.set(row.staffId, {
				staffId: row.staffId,
				staffName: row.staffName,
				pendingTotal: isPending ? row.calculatedAmount : 0,
				pendingCount: isPending ? 1 : 0,
				dominantStatus: row.status,
			});
		} else {
			if (isPending) {
				existing.pendingTotal += row.calculatedAmount;
				existing.pendingCount += 1;
			}
		}
	}
	const staffList = Array.from(staffMap.values()).sort(
		(a, b) => b.pendingTotal - a.pendingTotal,
	);

	// Filtered staff by search
	const filteredStaff = staffList.filter((s) =>
		!staffSearch
			? true
			: (s.staffName ?? "").toLowerCase().includes(staffSearch.toLowerCase()),
	);

	// Detail rows = rows for selected staff (or all if none selected)
	const detailRows = selectedStaffId
		? rows.filter((r) => r.staffId === selectedStaffId)
		: rows;

	const selectedStaff = selectedStaffId ? staffMap.get(selectedStaffId) : null;

	const detailPendingRows = detailRows.filter((r) => r.status === "pending");
	const detailPendingTotal = detailPendingRows.reduce(
		(s, r) => s + r.calculatedAmount,
		0,
	);
	const detailGrossSales = detailRows.reduce(
		(s, r) => s + r.calculatedAmount / (r.splitPercentage / 100 || 1),
		0,
	);

	// Row selection for detail
	const showSelectionColumn =
		activeTab === "pending" || activeTab === "approved";
	const selectableRows = detailRows.filter(isRowSelectable);
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

	const selectedTotalCents = detailRows
		.filter((r) => selectedIds.has(r.id))
		.reduce((s, r) => s + r.calculatedAmount, 0);

	// ── Guards ─────────────────────────────────────────────────────────────────
	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-[#6b7170]">
				Select an organization to view commissions.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center text-[#6b7170]">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm">
						You don't have permission to view commission splits.
					</p>
				</div>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="p-6">
				<StatusCallout
					variant="error"
					title="Couldn't load commissions"
					onRetry={() => refetch()}
				/>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────────
	return (
		<Skeleton
			name="commissions-all-tab"
			loading={isLoading}
			fallback={<PageLoader />}
		>
			<div className="px-6 pb-6">
				{/* V1 card */}
				<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
					{/* Inner toolbar: status tabs + tenant scope switcher */}
					<div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-3">
						<div className="flex items-center gap-1">
							{(
								[
									{ value: "all", label: "All" },
									{ value: "pending", label: "Pending" },
									{ value: "approved", label: "Approved" },
									{ value: "paid", label: "Paid" },
									{ value: "void", label: "Void" },
								] as { value: ActiveTab; label: string }[]
							).map((t) => (
								<button
									key={t.value}
									type="button"
									onClick={() => {
										setActiveTab(t.value);
										resetSelection();
									}}
									className={
										activeTab === t.value
											? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
											: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
									}
								>
									{t.label}
								</button>
							))}
						</div>
						<div className="flex items-center gap-2">
							<ScopeSwitcher className="h-8 w-44 text-xs" />
						</div>
					</div>

					<div className="grid grid-cols-[260px_1fr] divide-x divide-[#e5e5e5]">
						{/* ── STAFF SIDEBAR ── */}
						<aside className="flex flex-col">
							<div className="border-b border-[#e5e5e5] px-4 py-3">
								<input
									className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-[7px] text-xs text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a]"
									placeholder="Search staff…"
									value={staffSearch}
									onChange={(e) => setStaffSearch(e.target.value)}
								/>
							</div>
							<div className="flex-1 overflow-y-auto">
								{/* "All staff" entry */}
								<div
									className={`flex cursor-pointer items-center gap-3 border-b border-[#e5e5e5] px-4 py-3 transition-colors ${
										selectedStaffId === null
											? "bg-[#f3f3f3]"
											: "hover:bg-[#f3f3f3]/50"
									}`}
									onClick={() => {
										setSelectedStaffId(null);
										resetSelection();
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											setSelectedStaffId(null);
											resetSelection();
										}
									}}
									role="button"
									tabIndex={0}
								>
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d9d9ca] text-xs font-bold text-[#0a0a0a]">
										All
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-semibold text-[#0a0a0a]">
											All Staff
										</div>
										<div className="text-xs text-[#6b7170]">
											{staffList.length} trainers
										</div>
									</div>
									<div className="text-right">
										<div className="font-mono text-sm font-semibold tabular-nums">
											{formatPrice(totals.pending, "MYR")}
										</div>
										<StatusPill status="pending" />
									</div>
								</div>

								{filteredStaff.map((s, idx) => {
									const avatarColors = [
										"bg-black text-white",
										"bg-[#d9d9ca] text-[#0a0a0a]",
										"bg-[#e5e5e5] text-[#0a0a0a]",
										"bg-[#f3f3f3] text-[#0a0a0a]",
									];
									const avatarClass = avatarColors[idx % avatarColors.length];
									const isActive = selectedStaffId === s.staffId;
									return (
										<div
											key={s.staffId}
											className={`flex cursor-pointer items-center gap-3 border-t border-[#e5e5e5] px-4 py-3 transition-colors ${
												isActive ? "bg-[#f3f3f3]" : "hover:bg-[#f3f3f3]/50"
											}`}
											onClick={() => {
												setSelectedStaffId(isActive ? null : s.staffId);
												resetSelection();
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													setSelectedStaffId(isActive ? null : s.staffId);
													resetSelection();
												}
											}}
											role="button"
											tabIndex={0}
										>
											<div
												className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarClass}`}
											>
												{initials(s.staffName)}
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium text-[#0a0a0a]">
													{s.staffName ?? s.staffId.slice(0, 8)}
												</div>
												<div className="text-xs text-[#6b7170]">
													{s.pendingCount} pending
												</div>
											</div>
											<div className="text-right">
												<div className="font-mono text-sm font-medium tabular-nums">
													{formatPrice(s.pendingTotal, "MYR")}
												</div>
												<StatusPill status={s.dominantStatus} />
											</div>
										</div>
									);
								})}
							</div>
						</aside>

						{/* ── DETAIL PANEL ── */}
						<div className="flex flex-col">
							{/* Staff hero */}
							<div className="flex items-start justify-between border-b border-[#e5e5e5] px-6 py-5">
								<div className="flex items-center gap-4">
									<div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-black text-[17px] font-bold text-white">
										{selectedStaff ? initials(selectedStaff.staffName) : "ALL"}
									</div>
									<div>
										<div className="text-lg font-bold text-[#0a0a0a]">
											{selectedStaff
												? (selectedStaff.staffName ??
													selectedStaff.staffId.slice(0, 8))
												: "All Staff"}
										</div>
										<div className="mt-0.5 text-xs text-[#6b7170]">
											{activeTab === "all"
												? "All commissions"
												: `${activeTab} commissions`}
											{selectedStaff ? "" : ` · ${staffList.length} trainers`}
										</div>
									</div>
								</div>
								<div className="text-right">
									<div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8a8f91]">
										To Be Paid
									</div>
									<div className="mt-1 font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight">
										{formatPrice(
											selectedStaff
												? selectedStaff.pendingTotal
												: totals.pending,
											"MYR",
										)}
									</div>
									<div className="mt-2">
										<StatusPill status="pending" />
									</div>
								</div>
							</div>

							{/* Mini KPI band */}
							<div className="grid grid-cols-4 divide-x divide-[#e5e5e5] border-b border-[#e5e5e5]">
								<div className="px-5 py-4">
									<div className="text-[10px] uppercase tracking-widest text-[#8a8f91]">
										Pending
									</div>
									<div className="mt-1 font-mono text-lg font-semibold tabular-nums">
										{formatPrice(totals.pending, "MYR")}
									</div>
								</div>
								<div className="px-5 py-4">
									<div className="text-[10px] uppercase tracking-widest text-[#8a8f91]">
										Approved
									</div>
									<div className="mt-1 font-mono text-lg font-semibold tabular-nums">
										{formatPrice(totals.approved, "MYR")}
									</div>
								</div>
								<div className="px-5 py-4">
									<div className="text-[10px] uppercase tracking-widest text-[#8a8f91]">
										Paid
									</div>
									<div className="mt-1 font-mono text-lg font-semibold tabular-nums">
										{formatPrice(totals.paid, "MYR")}
									</div>
								</div>
								<div className="px-5 py-4">
									<div className="text-[10px] uppercase tracking-widest text-[#8a8f91]">
										Splits
									</div>
									<div className="mt-1 text-lg font-semibold">
										{detailRows.length}
									</div>
								</div>
							</div>

							{/* Bulk action bar (contextual) */}
							{selectedIds.size > 0 && organizationId && (
								<div className="border-b border-[#e5e5e5] px-6 py-2">
									<BulkActionBar
										selectedIds={Array.from(selectedIds)}
										selectedRows={detailRows.filter((r) =>
											selectedIds.has(r.id),
										)}
										tab={activeTab}
										organizationId={organizationId}
										canApprove={canApprove}
										canProcess={canProcess}
										onDone={resetSelection}
										totalAmountCents={selectedTotalCents}
									/>
								</div>
							)}

							{/* Ledger table */}
							<div className="flex-1 overflow-auto">
								{detailRows.length === 0 ? (
									<div className="flex min-h-48 items-center justify-center text-sm text-[#6b7170]">
										No commission splits found.
									</div>
								) : (
									<table className="w-full">
										<thead>
											<tr>
												{showSelectionColumn && (
													<th className="w-9 border-b border-[#e5e5e5] py-[9px] pl-[14px] pr-0">
														<input
															type="checkbox"
															className="cursor-pointer accent-black"
															style={{ width: 15, height: 15 }}
															checked={allSelectableSelected}
															onChange={toggleAllSelectable}
															aria-label="Select all"
														/>
													</th>
												)}
												{[
													"Date",
													"Staff",
													"Source",
													"Service",
													"Branch",
													"Rate",
													"Commission",
													"Earn Reason",
													"Status",
												].map((h) => (
													<th
														key={h}
														className={`border-b border-[#e5e5e5] px-[14px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-[.06em] whitespace-nowrap text-[#8a8f91] ${
															h === "Rate" || h === "Commission"
																? "text-right"
																: ""
														}`}
													>
														{h}
													</th>
												))}
												<th className="border-b border-[#e5e5e5] px-[14px] py-[9px]" />
											</tr>
										</thead>
										<tbody>
											{detailRows.map((row) => {
												const isVoid = row.status === "void";
												const selectable = isRowSelectable(row);
												return (
													<tr
														key={row.id}
														className="border-b border-[#f7f5ee] hover:bg-[#fcfaf6] last:border-0"
													>
														{showSelectionColumn && (
															<td className="w-9 py-[11px] pl-[14px] pr-0 align-middle">
																<input
																	type="checkbox"
																	className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
																	style={{
																		width: 15,
																		height: 15,
																		accentColor: "#000",
																	}}
																	checked={selectedIds.has(row.id)}
																	disabled={!selectable}
																	onChange={() => {
																		if (selectable) toggleRow(row.id);
																	}}
																	onClick={(e) => e.stopPropagation()}
																	aria-label={`Select commission ${row.id}`}
																/>
															</td>
														)}
														<td className="px-[14px] py-[11px] text-sm whitespace-nowrap text-[#0a0a0a] align-middle">
															{formatDate(row.createdAt)}
														</td>
														<td className="px-[14px] py-[11px] align-middle">
															<span className="text-sm font-medium text-[#0a0a0a]">
																{row.staffName ?? "—"}
															</span>
														</td>
														<td className="px-[14px] py-[11px] align-middle">
															<SourceCell row={row} />
														</td>
														<td className="px-[14px] py-[11px] text-sm text-[#0a0a0a] align-middle">
															{row.serviceName ?? (
																<span className="text-[#6b7170]">—</span>
															)}
														</td>
														<td className="px-[14px] py-[11px] text-sm text-[#6b7170] align-middle">
															{row.branchName ?? "—"}
														</td>
														<td className="px-[14px] py-[11px] text-right font-mono tabular-nums text-sm text-[#6b7170] align-middle">
															{row.splitPercentage > 0
																? `${row.splitPercentage}%`
																: "—"}
														</td>
														<td className="px-[14px] py-[11px] text-right font-semibold font-mono tabular-nums text-sm text-[#0a0a0a] align-middle">
															{formatPrice(row.calculatedAmount, "MYR")}
														</td>
														<td className="px-[14px] py-[11px] align-middle">
															{row.earnReason ? (
																<Badge
																	variant="secondary"
																	className="text-xs"
																	data-testid="commission-earn-reason-badge"
																>
																	{row.earnReason}
																</Badge>
															) : (
																<span className="text-[#6b7170] text-sm">
																	—
																</span>
															)}
														</td>
														<td className="px-[14px] py-[11px] align-middle">
															<span data-testid="commission-status-badge">
																<StatusPill status={row.status} />
															</span>
														</td>
														<td className="px-[14px] py-[11px] pr-4 text-right align-middle">
															{!isVoid && canApprove && (
																<button
																	type="button"
																	className="text-xs text-[#6b7170] underline underline-offset-2 hover:text-[#0a0a0a]"
																	onClick={(e) => {
																		e.stopPropagation();
																		handleVoidRow(row.id);
																	}}
																	disabled={voidingId === row.id}
																>
																	Void
																</button>
															)}
														</td>
													</tr>
												);
											})}
											{/* Pending total footer row */}
											{detailPendingRows.length > 0 && (
												<tr className="bg-[#f7f5ee]">
													<td
														colSpan={showSelectionColumn ? 7 : 6}
														className="px-[14px] py-[11px] text-right text-sm font-semibold text-[#0a0a0a]"
													>
														Total Pending
													</td>
													<td className="px-[14px] py-[11px] text-right font-bold font-mono tabular-nums text-base text-[#0a0a0a]">
														{formatPrice(detailPendingTotal, "MYR")}
													</td>
													<td colSpan={3} />
												</tr>
											)}
										</tbody>
									</table>
								)}
							</div>

							{/* Footer actions */}
							<div className="flex items-center justify-between border-t border-[#e5e5e5] px-6 py-4">
								<div className="flex gap-2">
									<span className="text-xs text-[#6b7170]">
										{detailRows.length} split
										{detailRows.length !== 1 ? "s" : ""}
										{selectedStaff
											? ` for ${selectedStaff.staffName ?? "this trainer"}`
											: ""}
									</span>
								</div>
								<div className="flex items-center gap-2">
									{selectedIds.size > 0 && (
										<span className="font-mono text-sm font-semibold tabular-nums text-[#0a0a0a]">
											{selectedIds.size} selected ·{" "}
											{formatPrice(selectedTotalCents, "MYR")}
										</span>
									)}
									{canApprove && detailPendingTotal > 0 && (
										<button
											type="button"
											className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] px-[14px] py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-85"
											onClick={() => {
												// Select all pending rows in view
												setSelectedIds(
													new Set(detailPendingRows.map((r) => r.id)),
												);
											}}
										>
											Approve all · {formatPrice(detailPendingTotal, "MYR")}
										</button>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>

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
		</Skeleton>
	);
}
