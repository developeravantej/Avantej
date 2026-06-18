import type { ExpenseCategory } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export function getTodayDateString(): string {
	return new Date().toISOString().split("T")[0];
}

export const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
	{ value: "travel", label: "Travel" },
	{ value: "equipment", label: "Equipment" },
	{ value: "supplies", label: "Supplies" },
	{ value: "training", label: "Training" },
	{ value: "other", label: "Other" },
];

export const STATUS_TABS: { value: string | undefined; label: string }[] = [
	{ value: undefined, label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
	{ value: "paid", label: "Paid" },
];

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
	travel: "bg-blue-50 text-blue-700",
	equipment: "bg-purple-50 text-purple-700",
	supplies: "bg-amber-50 text-amber-700",
	training: "bg-emerald-50 text-emerald-700",
	other: "bg-slate-100 text-slate-500",
};
