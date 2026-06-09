import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ProcessRefundDialog } from "@/components/refunds/process-refund-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusCallout } from "@/components/ui/status-callout";
import { AuditTrailDialog } from "@/features/refunds/components/AuditTrailDialog";
import { BulkApproveBar } from "@/features/refunds/components/BulkApproveBar";
import { QueueRow } from "@/features/refunds/components/QueueRow";
import { RejectDialog } from "@/features/refunds/components/RejectDialog";
import { COL_TEMPLATE } from "@/features/refunds/refunds.helpers";
import type { RefundRow, RefundStatus } from "@/features/refunds/refunds.types";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";

// ─── Status tab definition ─────────────────────────────────────────────────────

const STATUS_TABS: { value: RefundStatus | "all"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
	{ value: "processed", label: "Processed" },
];

// ─── RefundsTab ───────────────────────────────────────────────────────────────

export function RefundsTab({ organizationId }: { organizationId: string }) {
	const { hasPermission } = useUserContext();

	const canApprove = hasPermission("refund_management:approve");
	const canProcess = hasPermission("refund_management:process");

	// ── State ──────────────────────────────────────────────────────────────────
	const [activeTab, setActiveTab] = useState<RefundStatus | "all">("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedId, setExpandedId] = useState<string | null>(null);

	// Reject dialog
	const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
	const [rejectRefund, setRejectRefund] = useState<RefundRow | null>(null);

	// Process dialog
	const [processDialogOpen, setProcessDialogOpen] = useState(false);
	const [processRefundId, setProcessRefundId] = useState<string | null>(null);

	// Audit trail dialog
	const [auditDialogOpen, setAuditDialogOpen] = useState(false);
	const [auditRefund, setAuditRefund] = useState<RefundRow | null>(null);

	// Bulk selection
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	// ── Data ───────────────────────────────────────────────────────────────────
	const { data, isLoading, isError, error, refetch } = useQuery(
		orpc.refunds.list.queryOptions({
			input: {
				organizationId,
				status: activeTab === "all" ? undefined : activeTab,
				limit: 100,
				offset: 0,
			},
		}),
	);

	const allRows: RefundRow[] =
		(data as { rows?: RefundRow[] } | undefined)?.rows ?? [];

	// Client-side search filter
	const rows = searchQuery.trim()
		? allRows.filter((r) => {
				const q = searchQuery.toLowerCase();
				return (
					r.customerName.toLowerCase().includes(q) ||
					r.refundNumber.toLowerCase().includes(q) ||
					r.reason.toLowerCase().includes(q) ||
					(r.salesOrderNumber ?? "").toLowerCase().includes(q)
				);
			})
		: allRows;

	// ── KPI computations ───────────────────────────────────────────────────────
	const pendingRows = rows.filter((r) => r.status === "pending");
	const processedRows = rows.filter((r) => r.status !== "pending");
	const pendingCount = pendingRows.length;

	// ── Mutations ──────────────────────────────────────────────────────────────
	const rejectMutation = useApiMutation({
		mutationFn: (vars: { id: string; reviewNotes: string }) =>
			client.refunds.reject({
				organizationId,
				id: vars.id,
				reviewNotes: vars.reviewNotes,
			}),
		successMessage: "Refund rejected.",
		errorMessage: (err) => err.message ?? "Failed to reject refund.",
		invalidate: [orpc.refunds.list.key()],
		onSuccess: () => {
			setRejectDialogOpen(false);
			setRejectRefund(null);
			setExpandedId(null);
		},
	});

	// ── Helpers ────────────────────────────────────────────────────────────────
	function toggleExpand(id: string) {
		setExpandedId((prev) => (prev === id ? null : id));
	}

	function toggleSelect(id: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function toggleSelectAll() {
		if (selectedIds.size === pendingRows.length && pendingRows.length > 0) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(pendingRows.map((r) => r.id)));
		}
	}

	const allPendingSelected =
		pendingRows.length > 0 && selectedIds.size === pendingRows.length;
	const selectedRows = rows.filter((r) => selectedIds.has(r.id));

	// ── Render ─────────────────────────────────────────────────────────────────
	return (
		<div className="flex flex-col">
			<div
				className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white border border-[#e5e5e5] rounded-2xl"
				style={{ minHeight: "calc(100vh - 200px)" }}
			>
				{/* Toolbar */}
				<div className="flex shrink-0 items-center justify-between border-b border-[#e5e5e5] px-6 py-3">
					<div className="flex items-center gap-3">
						{/* Search */}
						<div className="relative">
							<svg
								className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								aria-hidden
							>
								<circle cx="11" cy="11" r="8" />
								<path d="m21 21-4.35-4.35" />
							</svg>
							<input
								type="text"
								className="w-60 rounded-xl border border-[#e5e5e5] bg-white py-[9px] pl-9 pr-3 text-sm text-[#0a0a0a] outline-none transition-colors placeholder:text-[#737373] focus:border-[#0a0a0a]"
								placeholder="Search refunds…"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>

						{/* Status tab pills */}
						<div className="flex items-center gap-1">
							{STATUS_TABS.map((tab) => {
								const isActive = activeTab === tab.value;
								const count =
									tab.value === "pending" ? pendingCount : undefined;
								return (
									<button
										key={tab.value}
										type="button"
										onClick={() => setActiveTab(tab.value)}
										className={
											isActive
												? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
												: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
										}
									>
										{tab.label}
										{count !== undefined && count > 0 && (
											<span className="rounded-full bg-black px-1.5 py-0.5 text-xs font-bold text-white">
												{count}
											</span>
										)}
									</button>
								);
							})}
						</div>
					</div>

					{/* Right side */}
					<div className="flex items-center gap-3">
						<button
							type="button"
							className="rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3]"
						>
							Export
						</button>
					</div>
				</div>

				{/* Column header */}
				<div
					className="grid shrink-0 items-center border-b border-[#e5e5e5] bg-[#f3f3f3] px-6 py-2"
					style={{ gridTemplateColumns: COL_TEMPLATE }}
				>
					<div className="flex items-center gap-2">
						{canApprove && pendingRows.length > 0 && (
							<Checkbox
								checked={allPendingSelected}
								onCheckedChange={toggleSelectAll}
								aria-label="Select all pending"
								className="flex-shrink-0"
							/>
						)}
						<span className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Customer / Reason
						</span>
					</div>
					<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Sale Ref
					</div>
					<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Requested
					</div>
					<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Amount
					</div>
					<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Status
					</div>
					<div />
				</div>

				{/* Scrollable list */}
				<div className="min-h-0 flex-1 overflow-y-auto">
					{isLoading ? (
						<div className="flex items-center justify-center py-20 text-sm text-[#737373]">
							Loading refunds…
						</div>
					) : isError ? (
						<div className="px-6 py-6">
							<StatusCallout
								variant="error"
								title="Failed to load refunds"
								onRetry={() => refetch()}
							>
								<p className="text-sm">
									{(error as Error)?.message ??
										"An error occurred. Please retry."}
								</p>
							</StatusCallout>
						</div>
					) : rows.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-20 gap-2">
							<svg
								width="32"
								height="32"
								viewBox="0 0 24 24"
								fill="none"
								stroke="#8a8f91"
								strokeWidth="1.5"
								aria-hidden
							>
								<path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" />
								<path d="M12 8v4M12 16h.01" />
							</svg>
							<p className="text-sm text-[#737373]">No refunds found.</p>
						</div>
					) : (
						<>
							{/* Pending section */}
							{pendingRows.length > 0 && (
								<>
									<div className="flex items-center gap-2 border-b border-[#e5e5e5] bg-[#f3f3f3] px-6 py-2">
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="#854d0e"
											strokeWidth="2.5"
											aria-hidden
										>
											<circle cx="12" cy="12" r="10" />
											<path d="M12 6v6l4 2" />
										</svg>
										<span className="text-xs font-semibold text-amber-800">
											{pendingCount} pending — awaiting your decision
										</span>
									</div>
									{pendingRows.map((refund) => (
										<QueueRow
											key={refund.id}
											refund={refund}
											isPending={true}
											isSelected={selectedIds.has(refund.id)}
											canApprove={canApprove}
											canProcess={canProcess}
											expanded={expandedId === refund.id}
											onToggle={() => toggleExpand(refund.id)}
											onToggleSelect={() => toggleSelect(refund.id)}
											onReject={(r) => {
												setRejectRefund(r);
												setRejectDialogOpen(true);
											}}
											onProcess={(r) => {
												setProcessRefundId(r.id);
												setProcessDialogOpen(true);
											}}
											onAuditTrail={(r) => {
												setAuditRefund(r);
												setAuditDialogOpen(true);
											}}
											organizationId={organizationId}
											onApproved={() => {
												setExpandedId(null);
												refetch();
											}}
										/>
									))}
								</>
							)}

							{/* Processed section */}
							{processedRows.length > 0 && (
								<>
									<div className="flex items-center gap-2 border-b border-[#e5e5e5] bg-[#f3f3f3] px-6 py-2">
										<span className="text-xs font-medium text-[#737373]">
											Processed refunds — {processedRows.length} record
											{processedRows.length !== 1 ? "s" : ""}
										</span>
									</div>
									{processedRows.map((refund) => (
										<QueueRow
											key={refund.id}
											refund={refund}
											isPending={false}
											isSelected={false}
											canApprove={canApprove}
											canProcess={canProcess}
											expanded={expandedId === refund.id}
											onToggle={() => toggleExpand(refund.id)}
											onToggleSelect={() => {}}
											onReject={(r) => {
												setRejectRefund(r);
												setRejectDialogOpen(true);
											}}
											onProcess={(r) => {
												setProcessRefundId(r.id);
												setProcessDialogOpen(true);
											}}
											onAuditTrail={(r) => {
												setAuditRefund(r);
												setAuditDialogOpen(true);
											}}
											organizationId={organizationId}
											onApproved={() => {
												setExpandedId(null);
												refetch();
											}}
										/>
									))}
								</>
							)}
						</>
					)}
				</div>

				{/* Bulk approve bar — shown inside card at bottom when selection active */}
				<BulkApproveBar
					selectedIds={[...selectedIds]}
					selectedRows={selectedRows}
					organizationId={organizationId}
					onDone={() => setSelectedIds(new Set())}
				/>
			</div>

			{/* Dialogs */}
			<AuditTrailDialog
				refund={auditRefund}
				open={auditDialogOpen}
				onOpenChange={setAuditDialogOpen}
				organizationId={organizationId}
			/>

			<RejectDialog
				open={rejectDialogOpen}
				onOpenChange={setRejectDialogOpen}
				onConfirm={(notes) => {
					if (!rejectRefund) return;
					rejectMutation.mutate({ id: rejectRefund.id, reviewNotes: notes });
				}}
				isPending={rejectMutation.isPending}
			/>

			{processRefundId && (
				<ProcessRefundDialog
					open={processDialogOpen}
					onOpenChange={(open) => {
						setProcessDialogOpen(open);
						if (!open) setProcessRefundId(null);
					}}
					organizationId={organizationId}
					refundId={processRefundId}
				/>
			)}
		</div>
	);
}
