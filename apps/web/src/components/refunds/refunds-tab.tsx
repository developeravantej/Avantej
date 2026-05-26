import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useApiMutation } from "@/hooks/useApiMutation";
import { ProcessRefundDialog } from "@/components/refunds/process-refund-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUserContext } from "@/hooks/useUserContext";
import { StatusCallout } from "@/components/ui/status-callout";
import { formatPrice, rmToCents } from "@/lib/money";
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type RefundStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "processed"
	| "cancelled";

type RefundRow = {
	id: string;
	refundNumber: string;
	status: string;
	salesOrderId: string | null;
	paymentId: string | null;
	packageInstanceId: string | null;
	amountCents: number;
	taxAmountCents: number;
	reason: string;
	notes: string | null;
	requestedBy: string;
	requestedAt: string | Date;
	reviewedBy: string | null;
	reviewedAt: string | Date | null;
	reviewNotes: string | null;
	processedBy: string | null;
	processedAt: string | Date | null;
	refundMethod: string | null;
	refundReference: string | null;
	customerId: string;
	customerName: string;
	requestedByName?: string | null;
	salesOrderNumber?: string | null;
};

type AuditRow = {
	id: string;
	action: string;
	createdAt: string | Date;
	summary?: string | null;
	actorName?: string | null;
};

// ─── Status tab definition ─────────────────────────────────────────────────────

const STATUS_TABS: { value: RefundStatus | "all"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
	{ value: "processed", label: "Processed" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		const diff = Date.now() - new Date(value).getTime();
		const days = Math.floor(diff / 86_400_000);
		if (days === 0) return "today";
		if (days === 1) return "yesterday";
		return `${days} days ago`;
	} catch {
		return "—";
	}
}

function formatDateTime(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleString("en-MY", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "—";
	}
}

function initials(name: string): string {
	return name
		.split(" ")
		.slice(0, 2)
		.map((p) => p[0] ?? "")
		.join("")
		.toUpperCase();
}

function saleRef(refund: RefundRow): string {
	if (refund.salesOrderNumber) return refund.salesOrderNumber;
	if (refund.salesOrderId) return refund.salesOrderId.slice(0, 8);
	if (refund.paymentId) return refund.paymentId.slice(0, 8);
	if (refund.packageInstanceId) return refund.packageInstanceId.slice(0, 8);
	return "—";
}

function saleRefLink(refund: RefundRow) {
	const label = saleRef(refund);
	if (refund.salesOrderId) {
		return (
			<Link
				to="/dashboard/sales/$id"
				params={{ id: refund.salesOrderId }}
				className="font-mono text-xs text-blue-600 hover:underline"
				onClick={(e) => e.stopPropagation()}
			>
				{label}
			</Link>
		);
	}
	return <span className="font-mono text-xs text-[#737373]">{label}</span>;
}

// ─── Status badge (design tokens) ─────────────────────────────────────────────

function RefundBadge({ status }: { status: string }) {
	const map: Record<string, string> = {
		pending:
			"bg-white text-[#4a4f51] border border-[#e5e5e5]",
		approved:
			"bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]",
		processed:
			"bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]",
		rejected:
			"bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca]",
		cancelled: "bg-[#d9d9ca] text-[#4a4f51]",
	};
	const cls = map[status] ?? "bg-[#d9d9ca] text-[#4a4f51]";
	const label =
		status === "processed"
			? "Paid"
			: status.charAt(0).toUpperCase() + status.slice(1);
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] font-medium leading-[1.4] ${cls}`}
		>
			{label}
		</span>
	);
}

// ─── Audit Trail Dialog ────────────────────────────────────────────────────────

function AuditTrailDialog({
	refund,
	open,
	onOpenChange,
	organizationId,
}: {
	refund: RefundRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
}) {
	const { data: auditData } = useQuery({
		queryKey: ["audit-refund", organizationId, refund?.id],
		queryFn: async () => {
			if (!refund?.id) return { rows: [] };
			return client.auditLogs.list({
				organizationId,
				entityType: "refund",
				entityId: refund.id,
				limit: 20,
				offset: 0,
			});
		},
		enabled: open && !!refund?.id,
	});

	if (!refund) return null;
	const auditRows = (auditData as { rows?: AuditRow[] } | undefined)?.rows ?? [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg overflow-y-auto max-h-[80vh]">
				<DialogHeader>
					<DialogTitle>Audit Trail</DialogTitle>
					<DialogDescription>
						Event history for refund{" "}
						<span className="font-mono font-medium">{refund.refundNumber}</span>.
					</DialogDescription>
				</DialogHeader>
				<div className="py-2 space-y-3">
					{auditRows.length === 0 ? (
						<p className="text-[#737373] text-sm">No audit events found.</p>
					) : (
						<div className="relative pl-4 space-y-4">
							<span
								aria-hidden
								className="absolute left-1.5 top-2 bottom-2 w-px bg-[#edede4]"
							/>
							{auditRows.map((row: AuditRow) => (
								<div key={row.id} className="relative flex gap-3">
									<span className="absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 border-black bg-white" />
									<div className="flex-1 min-w-0 space-y-0.5">
										<div className="flex items-center justify-between gap-2">
											<span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 font-mono text-orange-800 text-xs">
												{row.action}
											</span>
											<span className="text-[#737373] text-xs whitespace-nowrap">
												{formatDateTime(row.createdAt)}
											</span>
										</div>
										{row.summary && (
											<p className="text-sm text-[#737373]">{row.summary}</p>
										)}
										{row.actorName && (
											<p className="text-xs text-[#737373]">
												By:{" "}
												<span className="text-[#0a0a0a]">{row.actorName}</span>
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ─── Reject Dialog ─────────────────────────────────────────────────────────────

function RejectDialog({
	open,
	onOpenChange,
	onConfirm,
	isPending,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (notes: string) => void;
	isPending: boolean;
}) {
	const [notes, setNotes] = useState("");

	function handleConfirm() {
		if (!notes.trim()) return;
		onConfirm(notes.trim());
	}

	function handleClose() {
		setNotes("");
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
					<DialogTitle>Reject Refund</DialogTitle>
					<DialogDescription>
						Provide a reason for rejection. This will be visible in the audit trail.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3 py-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="reject-notes">
							Rejection Notes <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="reject-notes"
							rows={3}
							placeholder="Explain why this refund is being rejected…"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={handleClose} disabled={isPending}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleConfirm}
						disabled={isPending || !notes.trim()}
					>
						{isPending ? "Rejecting…" : "Reject"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Inline expanded decision panel ───────────────────────────────────────────

function InlineDecisionPanel({
	refund,
	organizationId,
	onApproved,
	onReject,
}: {
	refund: RefundRow;
	organizationId: string;
	onApproved: () => void;
	onReject: (refund: RefundRow) => void;
}) {
	const [amountRm, setAmountRm] = useState(
		(refund.amountCents / 100).toFixed(2),
	);
	const [notes, setNotes] = useState("");
	const [error, setError] = useState<string | null>(null);

	const approveMutation = useApiMutation({
		mutationFn: (vars: {
			id: string;
			approveAmountCents?: number;
			reviewNotes?: string;
		}) =>
			client.refunds.approve({
				organizationId,
				id: vars.id,
				approveAmountCents: vars.approveAmountCents,
				reviewNotes: vars.reviewNotes,
			}),
		successMessage: () => {
			const cents = rmToCents(Number(amountRm));
			return cents < refund.amountCents
				? `Partial approval: ${formatPrice(cents, "MYR")} approved.`
				: "Refund approved in full.";
		},
		errorMessage: (err) => err.message ?? "Failed to approve refund.",
		invalidate: [["refunds"]],
		onSuccess: () => {
			onApproved();
		},
	});

	function handleApprove() {
		const parsed = Number(amountRm);
		if (Number.isNaN(parsed) || parsed <= 0) {
			setError("Enter a valid amount greater than 0.");
			return;
		}
		const cents = rmToCents(parsed);
		if (cents > refund.amountCents) {
			setError(
				`Cannot exceed requested amount (${formatPrice(refund.amountCents, "MYR")}).`,
			);
			return;
		}
		setError(null);
		approveMutation.mutate({
			id: refund.id,
			approveAmountCents: cents,
			reviewNotes: notes.trim() || undefined,
		});
	}

	return (
		<div
			className="border-t border-[#e5e5e5] bg-[#f3f3f3] px-6 py-5"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="grid grid-cols-3 gap-8">
				{/* Refund Details */}
				<div>
					<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Refund Details
					</div>
					<div className="space-y-2 text-sm">
						<div className="flex justify-between">
							<span className="text-[#737373]">Refund ID</span>
							<span className="font-mono text-xs">{refund.refundNumber}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-[#737373]">Original sale</span>
							<span className="font-mono text-xs">{saleRef(refund)}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-[#737373]">Requested amount</span>
							<span className="font-mono font-semibold">
								{formatPrice(refund.amountCents, "MYR")}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-[#737373]">Reason category</span>
							<span className="text-xs truncate max-w-[140px]">{refund.reason}</span>
						</div>
					</div>
				</div>

				{/* Customer Note */}
				<div>
					<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Customer Note
					</div>
					<div className="rounded-lg border border-[#e5e5e5] bg-white p-3 text-sm text-[#737373] leading-relaxed">
						{refund.notes ? (
							<span>"{refund.notes}"</span>
						) : (
							<span className="italic">No additional notes provided.</span>
						)}
					</div>
					<div className="mt-2 text-xs text-[#737373]">No attachments</div>
				</div>

				{/* Decision */}
				<div>
					<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Decision
					</div>
					<div className="mb-3">
						<label className="mb-1.5 block text-xs font-medium text-[#0a0a0a]">
							Approve amount (edit if partial)
						</label>
						<div className="flex gap-0">
							<span className="flex items-center rounded-l-lg border border-r-0 border-[#e5e5e5] bg-white px-3 text-sm font-medium text-[#737373]">
								RM
							</span>
							<input
								type="number"
								step="0.01"
								min="0.01"
								className="w-full rounded-l-none rounded-r-lg border border-[#e5e5e5] bg-white px-3 py-[9px] text-sm text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a]"
								value={amountRm}
								onChange={(e) => {
									setAmountRm(e.target.value);
									setError(null);
								}}
							/>
						</div>
						{error && <p className="mt-1 text-xs text-red-600">{error}</p>}
					</div>
					<div className="mb-4">
						<label className="mb-1.5 block text-xs font-medium text-[#0a0a0a]">
							Internal note (optional)
						</label>
						<textarea
							rows={2}
							className="w-full resize-none rounded-lg border border-[#e5e5e5] bg-white px-3 py-[9px] text-sm text-[#0a0a0a] placeholder-[#6b7170] outline-none transition-colors focus:border-[#0a0a0a]"
							placeholder="e.g. Verified relocation documents…"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={approveMutation.isPending}
							onClick={handleApprove}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3.5 py-2 text-[13px] font-semibold text-[#15803d] transition-colors hover:bg-[#dcfce7] disabled:opacity-50"
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								aria-hidden
							>
								<path d="M20 6 9 17l-5-5" />
							</svg>
							{approveMutation.isPending ? "Approving…" : "Approve"}
						</button>
						<button
							type="button"
							disabled={approveMutation.isPending}
							onClick={() => onReject(refund)}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2 text-[13px] font-semibold text-[#b91c1c] transition-colors hover:bg-[#fee2e2] disabled:opacity-50"
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								aria-hidden
							>
								<path d="M18 6 6 18M6 6l12 12" />
							</svg>
							Reject
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

// ─── Queue Row ────────────────────────────────────────────────────────────────

const COL_TEMPLATE = "2fr 1fr 1fr 120px 90px 80px";

function QueueRow({
	refund,
	isPending,
	isSelected,
	canApprove,
	canProcess,
	expanded,
	onToggle,
	onToggleSelect,
	onReject,
	onProcess,
	onAuditTrail,
	organizationId,
	onApproved,
}: {
	refund: RefundRow;
	isPending: boolean;
	isSelected: boolean;
	canApprove: boolean;
	canProcess: boolean;
	expanded: boolean;
	onToggle: () => void;
	onToggleSelect: () => void;
	onReject: (r: RefundRow) => void;
	onProcess: (r: RefundRow) => void;
	onAuditTrail: (r: RefundRow) => void;
	organizationId: string;
	onApproved: () => void;
}) {
	const isWalkIn = !refund.customerId.startsWith("mem_");

	const avatarCls = isPending
		? isWalkIn
			? "bg-[#d9d9ca] text-[#0a0a0a]"
			: "bg-[#000] text-white"
		: isWalkIn
			? "bg-[#d9d9ca] text-[#0a0a0a] opacity-50"
			: "bg-[#000] text-white opacity-50";

	const rowBase = isPending
		? "hover:bg-[#f3f3f3]/50 cursor-pointer"
		: "hover:bg-[#f3f3f3]/30 cursor-pointer";

	return (
		<div className="border-b border-[#e5e5e5] last:border-b-0">
			<div
				className={`grid items-center px-6 ${isPending ? "py-4" : "py-3.5"} ${rowBase}`}
				style={{ gridTemplateColumns: COL_TEMPLATE }}
				onClick={onToggle}
			>
				{/* Customer / Reason */}
				<div className="flex items-center gap-3">
					{isPending && canApprove && (
						<Checkbox
							checked={isSelected}
							onCheckedChange={onToggleSelect}
							onClick={(e) => e.stopPropagation()}
							aria-label={`Select ${refund.refundNumber}`}
							className="flex-shrink-0"
						/>
					)}
					<span
						className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarCls}`}
					>
						{initials(refund.customerName)}
					</span>
					<div>
						<div className="flex items-center gap-2">
							<span
								className={`text-sm font-semibold ${isPending ? "text-[#0a0a0a]" : "text-[#0a0a0a]"}`}
							>
								{refund.customerName}
							</span>
							<span
								className={`inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-medium leading-[1.4] ${isWalkIn ? "bg-[#d9d9ca] text-[#0a0a0a]" : "bg-[#000] text-white"}`}
							>
								{isWalkIn ? "Walk-in" : "Member"}
							</span>
						</div>
						<div className="mt-0.5 max-w-xs truncate text-xs text-[#737373]">
							{refund.reason}
						</div>
					</div>
				</div>

				{/* Sale Ref */}
				<div onClick={(e) => e.stopPropagation()}>{saleRefLink(refund)}</div>

				{/* Requested */}
				<div className="text-xs text-[#737373]">{timeAgo(refund.requestedAt)}</div>

				{/* Amount */}
				<div
					className={`font-mono tabular-nums ${isPending ? "text-sm font-semibold text-[#0a0a0a]" : "text-sm text-[#0a0a0a]"}`}
				>
					{formatPrice(refund.amountCents, "MYR")}
				</div>

				{/* Status */}
				<div>
					<RefundBadge status={refund.status} />
				</div>

				{/* Chevron + actions */}
				<div className="flex items-center justify-end gap-1">
					{/* Mark processed for approved rows */}
					{refund.status === "approved" && canProcess && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onProcess(refund);
							}}
							className="mr-1 rounded-md border border-[#e5e5e5] bg-white px-2 py-1 text-[11px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3]"
						>
							Mark Paid
						</button>
					)}
					{/* Audit trail overflow */}
					<button
						type="button"
						title="View audit trail"
						onClick={(e) => {
							e.stopPropagation();
							onAuditTrail(refund);
						}}
						className="rounded-md p-1 text-[#737373] transition-colors hover:bg-[#f3f3f3] hover:text-[#0a0a0a]"
					>
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M12 6v6l4 2" />
						</svg>
					</button>
					{/* Chevron */}
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						className={`transition-transform ${expanded ? "rotate-180" : ""}`}
						aria-hidden
					>
						<path d="m6 9 6 6 6-6" />
					</svg>
				</div>
			</div>

			{/* Inline expanded panel — pending only shows decision; others show details */}
			{expanded && (
				<>
					{isPending && canApprove ? (
						<InlineDecisionPanel
							refund={refund}
							organizationId={organizationId}
							onApproved={onApproved}
							onReject={onReject}
						/>
					) : (
						<div className="border-t border-[#e5e5e5] bg-[#f3f3f3] px-6 py-5">
							<div className="grid grid-cols-2 gap-6 text-sm">
								<div className="space-y-2">
									<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
										Refund Details
									</div>
									<div className="flex justify-between">
										<span className="text-[#737373]">Refund #</span>
										<span className="font-mono text-xs">{refund.refundNumber}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-[#737373]">Amount</span>
										<span className="font-mono font-semibold">
											{formatPrice(refund.amountCents, "MYR")}
										</span>
									</div>
									{refund.reviewedAt && (
										<div className="flex justify-between">
											<span className="text-[#737373]">Reviewed</span>
											<span className="text-xs">
												{formatDateTime(refund.reviewedAt)}
											</span>
										</div>
									)}
									{refund.reviewNotes && (
										<div className="flex justify-between gap-4">
											<span className="text-[#737373] shrink-0">Review note</span>
											<span className="text-xs text-right">{refund.reviewNotes}</span>
										</div>
									)}
								</div>
								<div className="space-y-2">
									<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
										Request Info
									</div>
									<div className="flex justify-between">
										<span className="text-[#737373]">Reason</span>
										<span className="text-xs text-right max-w-[200px]">
											{refund.reason}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-[#737373]">Requested by</span>
										<span className="text-xs">
											{refund.requestedByName ??
												`${refund.requestedBy.slice(0, 8)}…`}
										</span>
									</div>
									{refund.notes && (
										<div className="flex justify-between gap-4">
											<span className="text-[#737373] shrink-0">Notes</span>
											<span className="text-xs text-right">{refund.notes}</span>
										</div>
									)}
								</div>
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
}

// ─── Bulk Approve Bar ─────────────────────────────────────────────────────────

function BulkApproveBar({
	selectedIds,
	selectedRows,
	organizationId,
	onDone,
}: {
	selectedIds: string[];
	selectedRows: RefundRow[];
	organizationId: string;
	onDone: () => void;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const count = selectedIds.length;
	const totalCents = selectedRows.reduce((s, r) => s + r.amountCents, 0);

	const bulkApproveMutation = useApiMutation({
		mutationFn: () =>
			client.refunds.bulkApprove({
				organizationId,
				items: selectedIds.map((id) => ({ id })),
			}),
		successMessage: `Approved ${count} refund${count !== 1 ? "s" : ""}.`,
		errorMessage: (err) => err.message ?? "Bulk approve failed.",
		invalidate: [["refunds"]],
		onSuccess: () => {
			setConfirmOpen(false);
			onDone();
		},
	});

	const pendingOnly = selectedRows.every((r) => r.status === "pending");
	if (count === 0 || !pendingOnly) return null;

	return (
		<>
			{/* Floating bar anchored to bottom of the edge-to-edge wrapper */}
			<div className="flex shrink-0 items-center gap-3 border-t border-[#e5e5e5] bg-white px-6 py-3">
				<span className="text-sm font-medium text-[#0a0a0a]">
					{count} refund{count !== 1 ? "s" : ""} selected
				</span>
				<span className="font-mono text-sm tabular-nums text-[#737373]">
					{formatPrice(totalCents, "MYR")} total
				</span>
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={onDone}
						className="rounded-lg border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3]"
					>
						Clear
					</button>
					<button
						type="button"
						onClick={() => setConfirmOpen(true)}
						className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3.5 py-2 text-[13px] font-semibold text-[#15803d] transition-colors hover:bg-[#dcfce7]"
					>
						Approve {count}
					</button>
				</div>
			</div>

			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Bulk Approve Refunds</DialogTitle>
						<DialogDescription>
							Approve {count} refund{count !== 1 ? "s" : ""} totalling{" "}
							<span className="font-semibold font-mono">
								{formatPrice(totalCents, "MYR")}
							</span>
							? Each will be approved at its full requested amount.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setConfirmOpen(false)}
							disabled={bulkApproveMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => bulkApproveMutation.mutate()}
							disabled={bulkApproveMutation.isPending}
						>
							{bulkApproveMutation.isPending ? "Approving…" : "Confirm Approve"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

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
	const { data, isLoading, isError, error, refetch } = useQuery({
		queryKey: ["refunds", organizationId, activeTab],
		queryFn: async () => {
			return client.refunds.list({
				organizationId,
				status: activeTab === "all" ? undefined : activeTab,
				limit: 100,
				offset: 0,
			});
		},
		enabled: true,
	});

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
	const processedRows = rows.filter(
		(r) => r.status !== "pending",
	);
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
		invalidate: [["refunds"]],
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
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white border border-[#e5e5e5] rounded-2xl" style={{ minHeight: "calc(100vh - 200px)" }}>
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
									tab.value === "pending"
										? pendingCount
										: undefined;
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
