import {
	Pin,
	PinOff,
	Pencil,
	Archive,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AudienceChip } from "./AudienceChip";
import { StatusPill } from "./StatusPill";
import {
	type AnnouncementRow,
	formatDate,
	formatShortDate,
	priorityDot,
	priorityLabel,
} from "./types";

// ─── Individual announcement row (collapsible) ────────────────────────────────

interface AnnouncementListItemProps {
	row: AnnouncementRow;
	isExpanded: boolean;
	isMutating: boolean;
	nodeNameMap: Record<string, string>;
	onToggleExpand: (id: string) => void;
	onPin: (id: string, isPinned: boolean) => void;
	onEdit: (row: AnnouncementRow) => void;
	onDeactivate: (id: string) => void;
	onDelete: (id: string) => void;
}

export function AnnouncementListItem({
	row,
	isExpanded,
	isMutating,
	nodeNameMap,
	onToggleExpand,
	onPin,
	onEdit,
	onDeactivate,
	onDelete,
}: AnnouncementListItemProps) {
	const scopeNames = (row.scopedBranchIds ?? []).map(
		(id) => nodeNameMap[id] ?? id,
	);

	return (
		<div
			className={cn(
				"transition",
				isExpanded
					? "bg-[#f3f3f3] border-l-2 border-l-[#0a0a0a]"
					: "border-l-2 border-l-transparent",
			)}
		>
			{/* ─ Row header (always visible) ─ */}
			<div
				className={cn(
					"flex items-start gap-4 px-5 cursor-pointer",
					isExpanded ? "pt-4 pb-2" : "py-3.5 hover:bg-[#fafafa]",
				)}
				onClick={() => onToggleExpand(row.id)}
			>
				{/* Priority dot */}
				<span
					className={cn(
						"mt-1.5 w-2 h-2 rounded-full flex-shrink-0",
						priorityDot(row.priority),
					)}
					title={`${priorityLabel(row.priority)} priority`}
				/>

				{/* Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline gap-2 flex-wrap">
						<span className="font-semibold text-sm text-[#0a0a0a]">
							{row.title}
						</span>
						<AudienceChip audience={row.targetAudience} />
						{scopeNames.length > 0 && (
							<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700">
								{scopeNames.length === 1
									? scopeNames[0]
									: `${scopeNames[0]} +${scopeNames.length - 1}`}
							</span>
						)}
						{row.requiresAcknowledgement && (
							<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
								Requires ack
							</span>
						)}
						<StatusPill isActive={row.isActive} isPinned={row.isPinned} />
					</div>
					{!isExpanded && (
						<p className="mt-0.5 text-xs text-[#737373] truncate">
							{row.message}
						</p>
					)}
				</div>

				{/* Right meta */}
				<div className="text-right flex-shrink-0 space-y-0.5 flex flex-col items-end">
					{/* STUB: views/ack counts not available from API */}
					<div className="text-[10px] text-[#737373] font-mono tabular-nums">
						{formatShortDate(row.createdAt)}
					</div>
					{isExpanded ? (
						<ChevronUp className="h-3.5 w-3.5 text-[#737373] mt-0.5" />
					) : (
						<ChevronDown className="h-3.5 w-3.5 text-[#737373] mt-0.5" />
					)}
				</div>
			</div>

			{/* ─ Expanded body ─ */}
			{isExpanded && (
				<div className="px-5 pb-4">
					{/* Message body */}
					<p className="text-sm text-[#404040] leading-relaxed mb-4 pl-6">
						{row.message}
					</p>

					{/* Meta row */}
					<div className="pl-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#737373] mb-4">
						{/* STUB: views count — not returned by API */}
						<span className="flex items-center gap-1">
							<span className="font-mono tabular-nums font-semibold text-[#737373]">
								—
							</span>{" "}
							views
						</span>

						{/* STUB: ack count — not returned by API */}
						<span className="flex items-center gap-1">
							<span className="font-mono tabular-nums font-semibold text-[#737373]">
								—
							</span>{" "}
							acknowledged
						</span>

						{row.startDate && (
							<span>
								From{" "}
								<span className="font-medium text-[#0a0a0a]">
									{formatDate(row.startDate)}
								</span>
							</span>
						)}
						{row.endDate ? (
							<span>
								Expires{" "}
								<span className="font-medium text-[#0a0a0a]">
									{formatDate(row.endDate)}
								</span>
							</span>
						) : (
							<span>No expiry</span>
						)}
						<span>
							Priority:{" "}
							<span className="font-medium text-[#0a0a0a]">
								{priorityLabel(row.priority)}
							</span>
						</span>
					</div>

					{/* Action buttons */}
					<div className="pl-6 flex flex-wrap gap-1.5">
						{/* Pin / Unpin */}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onPin(row.id, !row.isPinned);
							}}
							disabled={isMutating}
							className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] px-3 py-1 rounded-[10px] text-[13px] font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition disabled:opacity-50"
						>
							{row.isPinned ? (
								<>
									<PinOff className="h-3.5 w-3.5" /> Unpin
								</>
							) : (
								<>
									<Pin className="h-3.5 w-3.5" /> Pin
								</>
							)}
						</button>

						{/* Edit */}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onEdit(row);
							}}
							disabled={isMutating}
							className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] px-3 py-1 rounded-[10px] text-[13px] font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition disabled:opacity-50"
						>
							<Pencil className="h-3.5 w-3.5" /> Edit
						</button>

						{/* Deactivate (archive) — only when active */}
						{row.isActive && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onDeactivate(row.id);
								}}
								disabled={isMutating}
								className="inline-flex items-center gap-1.5 bg-white border border-rose-200 px-3 py-1 rounded-[10px] text-[13px] font-medium text-rose-600 hover:bg-rose-50 transition disabled:opacity-50"
							>
								<Archive className="h-3.5 w-3.5" /> Archive
							</button>
						)}

						{/* Delete */}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onDelete(row.id);
							}}
							disabled={isMutating}
							className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] px-3 py-1 rounded-[10px] text-[13px] font-medium text-[#737373] hover:bg-[#f3f3f3] hover:text-[#0a0a0a] transition disabled:opacity-50"
						>
							Delete
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
