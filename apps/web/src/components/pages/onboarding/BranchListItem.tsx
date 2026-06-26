import { cn } from "@/lib/utils";
import { getInitials } from "./helpers";
import type { Row } from "./types";

interface BranchListItemProps {
	row: Row;
	isSelected: boolean;
	onSelect: () => void;
}

export function BranchListItem({
	row,
	isSelected,
	onSelect,
}: BranchListItemProps) {
	const hasQr = row.invite !== null;
	const isNearLimit =
		hasQr &&
		row.invite!.maxUses !== null &&
		row.invite!.usesCount / row.invite!.maxUses >= 0.8;

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"w-full rounded-xl border-l-2 px-3 py-2.5 text-left transition-colors",
				isSelected
					? "bg-[#d6cdb1]/20 border-l-[#0a0a0a]"
					: "border-l-transparent hover:bg-[#f3f3f3]",
			)}
			data-testid={`branch-item-${row.branchId}`}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2.5 min-w-0">
					<div
						className={cn(
							"flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold",
							isSelected
								? "bg-[#0a0a0a]/10 text-[#0a0a0a]"
								: isNearLimit
									? "bg-amber-100 text-amber-700"
									: "bg-[#f3f3f3] text-[#737373]",
						)}
					>
						{getInitials(row.branchName)}
					</div>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium leading-tight text-[#0a0a0a]">
							{row.branchName}
						</p>
						{hasQr && (
							<p className="font-mono text-[10px] text-[#737373] truncate">
								{row.invite!.id.slice(0, 8)}…
							</p>
						)}
					</div>
				</div>
				{hasQr ? (
					<span
						className={cn(
							"inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono tabular-nums",
							isNearLimit
								? "bg-amber-50 text-amber-700"
								: "bg-emerald-50 text-emerald-700",
						)}
					>
						<span
							className={cn(
								"h-1.5 w-1.5 rounded-full",
								isNearLimit ? "bg-amber-500" : "bg-emerald-500",
							)}
						/>
						{row.invite!.usesCount}
						{row.invite!.maxUses != null ? `/${row.invite!.maxUses}` : ""}
					</span>
				) : (
					<span className="inline-flex items-center shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f3f3f3] text-[#737373]">
						No QR
					</span>
				)}
			</div>
		</button>
	);
}
