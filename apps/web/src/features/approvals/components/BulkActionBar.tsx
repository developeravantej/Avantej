import { X } from "lucide-react";
import { formatPriceShort } from "../approvals.helpers";
import type { PendingRow } from "../approvals.types";

export function BulkActionBar({
	checkedIds,
	list,
	isAdmin,
	onApprove,
	onReject,
	onClear,
}: {
	checkedIds: Set<string>;
	list: PendingRow[];
	isAdmin: boolean;
	onApprove: () => void;
	onReject: () => void;
	onClear: () => void;
}) {
	if (checkedIds.size === 0) return null;

	const selectedRows = list.filter((r) => checkedIds.has(r.id));
	const totalValueCents = selectedRows.reduce(
		(s, r) => s + (r.totalPrice ?? 0),
		0,
	);

	return (
		<div className="mt-4 flex items-center justify-between rounded-xl border border-[#0a0a0a] bg-[#0a0a0a] p-3 text-white shadow-lg">
			<div className="flex items-center gap-3 text-xs">
				<span className="font-mono font-bold tabular-nums">
					{checkedIds.size} selected
				</span>
				<span className="text-white/40">·</span>
				<span className="font-mono tabular-nums">
					{formatPriceShort(totalValueCents)} total value
				</span>
			</div>
			<div className="flex items-center gap-2">
				{isAdmin && (
					<>
						<button
							type="button"
							onClick={onApprove}
							className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3]"
						>
							Approve {checkedIds.size}…
						</button>
						<button
							type="button"
							onClick={onReject}
							className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20"
						>
							Reject…
						</button>
					</>
				)}
				<button
					type="button"
					onClick={onClear}
					className="ml-2 text-white/40 transition-colors hover:text-white"
					title="Clear selection"
				>
					<X size={14} />
				</button>
			</div>
		</div>
	);
}
