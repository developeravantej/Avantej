import { Checkbox } from "@/components/ui/checkbox";
import {
	COL_TEMPLATE,
	formatDateTime,
	initials,
	saleRefLink,
	timeAgo,
} from "@/features/refunds/refunds.helpers";
import type { RefundRow } from "@/features/refunds/refunds.types";
import { formatPrice } from "@/lib/money";
import { InlineDecisionPanel } from "@/features/refunds/components/InlineDecisionPanel";
import { RefundBadge } from "@/features/refunds/components/RefundBadge";

// ─── Queue Row ────────────────────────────────────────────────────────────────

export function QueueRow({
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
	// Use the sales order's customer_type — customer ids are UUIDs, so the old
	// startsWith("mem_") heuristic labelled every customer a walk-in.
	const isWalkIn = refund.customerType === "walk_in";

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
				<div className="text-xs text-[#737373]">
					{timeAgo(refund.requestedAt)}
				</div>

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
										<span className="font-mono text-xs">
											{refund.refundNumber}
										</span>
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
											<span className="text-[#737373] shrink-0">
												Review note
											</span>
											<span className="text-xs text-right">
												{refund.reviewNotes}
											</span>
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
