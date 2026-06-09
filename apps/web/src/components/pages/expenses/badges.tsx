import { CATEGORY_COLORS } from "./constants";
import type { ExpenseCategory, ExpenseStatus } from "./types";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
	const map: Record<ExpenseStatus, string> = {
		pending: "bg-amber-50 text-amber-700",
		approved: "bg-emerald-50 text-emerald-700",
		rejected: "bg-rose-50 text-rose-600",
		paid: "bg-blue-50 text-blue-700",
	};
	const dotMap: Record<ExpenseStatus, string> = {
		pending: "bg-amber-500",
		approved: "bg-emerald-500",
		rejected: "bg-rose-500",
		paid: "bg-blue-500",
	};
	const cls = map[status] ?? "bg-slate-100 text-slate-500";
	const dot = dotMap[status] ?? "bg-slate-400";
	const label = status.charAt(0).toUpperCase() + status.slice(1);
	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}
		>
			<span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
			{label}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Category chip
// ---------------------------------------------------------------------------

export function CategoryChip({ category }: { category: ExpenseCategory }) {
	const cls = CATEGORY_COLORS[category] ?? "bg-slate-100 text-slate-500";
	return (
		<span
			className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${cls}`}
		>
			{category}
		</span>
	);
}
