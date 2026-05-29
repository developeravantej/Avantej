import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	formatAge,
	formatOverdue,
	formatPrice,
	getDateGroup,
	getInitials,
	getPriority,
} from "../approvals.helpers";
import type { PendingRow } from "../approvals.types";
import { ExpandedRowDetail } from "./ExpandedRowDetail";
import { PriorityDot } from "./PriorityDot";

export function InboxRow({
	row,
	isExpanded,
	isChecked,
	isAdmin,
	isTrainer,
	callerMemberId,
	organizationId,
	isFirstInList,
	onToggle,
	onCheck,
	onAssigned,
	onReject,
}: {
	row: PendingRow;
	isExpanded: boolean;
	isChecked: boolean;
	isAdmin: boolean;
	isTrainer: boolean;
	callerMemberId: string | null;
	organizationId: string;
	isFirstInList: boolean;
	onToggle: () => void;
	onCheck: () => void;
	onAssigned: () => void;
	onReject: (row: PendingRow) => void;
}) {
	const priority = getPriority(row);
	const group = getDateGroup(row);
	const isOverdue = group === "older";
	const initials = getInitials(row.customerName);

	return (
		<div
			className={cn(
				"border-b border-[#e5e5e5] transition-colors",
				isExpanded && "bg-[#f3f3f3]/40",
				isOverdue && !isExpanded && "border-l-2 border-l-rose-500 bg-rose-50/30",
				isChecked && !isOverdue && !isExpanded && "bg-[#f3f3f3]/40",
			)}
		>
			{/* Clickable row header */}
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left transition-colors",
					isOverdue
						? "hover:bg-rose-50/50"
						: "hover:bg-[#f3f3f3]",
				)}
			>
				{/* Checkbox */}
				<span
					role="checkbox"
					aria-checked={isChecked}
					tabIndex={0}
					onClick={(e) => {
						e.stopPropagation();
						onCheck();
					}}
					onKeyDown={(e) => {
						if (e.key === " " || e.key === "Enter") {
							e.stopPropagation();
							onCheck();
						}
					}}
					className={cn(
						"inline-block h-3.5 w-3.5 shrink-0 cursor-pointer rounded-[3px] border",
						isChecked
							? "border-[#0a0a0a] bg-[#0a0a0a]"
							: "border-[#a3a3a3] bg-white",
					)}
				>
					{isChecked && (
						<svg viewBox="0 0 16 16" fill="white" className="h-full w-full">
							<path d="M13.485 4.515a.75.75 0 0 0-1.06-1.06L6.5 9.379 3.575 6.455a.75.75 0 1 0-1.06 1.06l3.485 3.486a.75.75 0 0 0 1.061 0z" />
						</svg>
					)}
				</span>

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

				<div className="shrink-0 font-mono text-sm font-bold tabular-nums text-[#0a0a0a]">
					{formatPrice(row.totalPrice)}
				</div>
				<div className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
					{formatAge(row.createdAt)}
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
					onAssigned={onAssigned}
					onReject={onReject}
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
