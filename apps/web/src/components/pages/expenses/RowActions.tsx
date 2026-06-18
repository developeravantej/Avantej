import type { ExpenseRow } from "./types";

// ---------------------------------------------------------------------------
// Table row actions
// ---------------------------------------------------------------------------

export function RowActions({
	row,
	canUpdate,
	onApprove,
	onReject,
	onMarkPaid,
}: {
	row: ExpenseRow;
	canUpdate: boolean;
	onApprove: (id: string) => void;
	onReject: (id: string) => void;
	onMarkPaid: (id: string) => void;
}) {
	if (!canUpdate) {
		return (
			<span className="font-mono tabular-nums text-[#737373] text-xs">—</span>
		);
	}
	if (row.status === "pending") {
		return (
			<div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
				<button
					type="button"
					onClick={() => onApprove(row.id)}
					className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
				>
					Approve
				</button>
				<button
					type="button"
					onClick={() => onReject(row.id)}
					className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 transition-colors"
				>
					Reject
				</button>
			</div>
		);
	}
	if (row.status === "approved") {
		return (
			<div className="opacity-0 group-hover:opacity-100 transition-opacity">
				<button
					type="button"
					onClick={() => onMarkPaid(row.id)}
					className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
				>
					Mark Paid
				</button>
			</div>
		);
	}
	return (
		<span className="font-mono tabular-nums text-[#737373] text-xs">—</span>
	);
}
