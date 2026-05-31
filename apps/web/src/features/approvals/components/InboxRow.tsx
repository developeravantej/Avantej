import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	formatActionDateTime,
	formatAge,
	formatOverdue,
	formatPrice,
	getActionDate,
	getDateGroup,
	getInitials,
	getPriority,
} from "../approvals.helpers";
import type { ApprovalStatus, PendingRow } from "../approvals.types";
import { ExpandedRowDetail } from "./ExpandedRowDetail";
import { PriorityDot } from "./PriorityDot";

export function InboxRow({
	row,
	isExpanded,
	isAdmin,
	isTrainer,
	callerMemberId,
	organizationId,
	approvalStatus,
	isFirstInList,
	onToggle,
	onAssigned,
	onReject,
	onSchedule,
}: {
	row: PendingRow;
	isExpanded: boolean;
	isAdmin: boolean;
	isTrainer: boolean;
	callerMemberId: string | null;
	organizationId: string;
	approvalStatus: ApprovalStatus;
	isFirstInList: boolean;
	onToggle: () => void;
	onAssigned: () => void;
	onReject: (row: PendingRow) => void;
	onSchedule: (packageInstanceId: string) => void;
}) {
	const priority = getPriority(row);
	const actionDate = getActionDate(row, approvalStatus);
	const group = getDateGroup({ ...row, createdAt: actionDate });
	const isOverdue = approvalStatus === "pending" && group === "older";
	const initials = getInitials(row.customerName);

	return (
		<div
			className={cn(
				"border-b border-[#e5e5e5] transition-colors",
				isExpanded && "bg-[#f3f3f3]/40",
				isOverdue &&
					!isExpanded &&
					"border-l-2 border-l-rose-500 bg-rose-50/30",
			)}
		>
			{/* Clickable row header */}
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left transition-colors",
					isOverdue ? "hover:bg-rose-50/50" : "hover:bg-[#f3f3f3]",
				)}
			>
				<PriorityDot priority={priority} />

				{/* Avatar */}
				<div
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
						isFirstInList ? "bg-[#d6cdb1]/50" : "bg-[#f3f3f3]",
					)}
				>
					{initials}
				</div>

				{/* Content */}
				<div className="flex min-w-0 flex-1 items-baseline gap-3 truncate">
					<span className="shrink-0 text-sm font-bold text-[#0a0a0a]">
						{row.customerName ?? "Unknown"}
					</span>
					<span className="truncate text-xs text-muted-foreground">
						{row.serviceName ?? "—"}
					</span>
					{(row.paymentStatus === "refunded" ||
						row.paymentStatus === "failed") && (
						<span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
							{row.paymentStatus === "refunded" ? "Refunded" : "Payment failed"}
						</span>
					)}
					{row.preferredTrainerName && (
						<span className="ml-auto shrink-0 rounded-full bg-[#f3f3f3] px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
							Trainer requested: {row.preferredTrainerName}
						</span>
					)}
					{isOverdue && (
						<span className="ml-auto shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
							{formatOverdue(row.createdAt)}
						</span>
					)}
				</div>

				{approvalStatus !== "pending" && (
					<div className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
						{formatActionDateTime(actionDate)}
					</div>
				)}
				<div className="shrink-0 font-mono text-sm font-bold tabular-nums text-[#0a0a0a]">
					{formatPrice(row.totalPrice)}
				</div>
				<div className="w-24 shrink-0 text-right text-[10px] text-muted-foreground">
					{formatAge(actionDate)}
				</div>
				<ChevronDown
					size={14}
					className={cn(
						"shrink-0 text-muted-foreground transition-transform duration-150",
						isExpanded && "rotate-180",
					)}
				/>
			</button>

			{/* Expanded detail */}
			{isExpanded && (
				<ExpandedRowDetail
					row={row}
					isAdmin={isAdmin}
					isTrainer={isTrainer}
					callerMemberId={callerMemberId}
					organizationId={organizationId}
					approvalStatus={approvalStatus}
					onAssigned={onAssigned}
					onReject={onReject}
					onSchedule={onSchedule}
				/>
			)}
		</div>
	);
}

export function GroupHeader({ label }: { label: string }) {
	return (
		<div className="border-b border-[#e5e5e5] bg-[#f3f3f3]/60 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
			{label}
		</div>
	);
}
