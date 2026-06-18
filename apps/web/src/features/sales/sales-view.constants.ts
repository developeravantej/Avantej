export const REASON_CATEGORIES = [
	{ value: "", label: "All reasons" },
	{ value: "customer_changed_mind", label: "Customer changed mind" },
	{ value: "payment_failed", label: "Payment failed" },
	{ value: "wrong_item", label: "Wrong item" },
	{ value: "fraud_suspected", label: "Fraud suspected" },
	{ value: "system_error", label: "System error" },
	{ value: "other", label: "Other" },
];

export const REASON_CATEGORY_LABELS: Record<string, string> = {
	customer_changed_mind: "Customer changed mind",
	payment_failed: "Payment failed",
	wrong_item: "Wrong item",
	fraud_suspected: "Fraud suspected",
	system_error: "System error",
	other: "Other",
};

export const REASON_BADGE_CLASSES: Record<string, string> = {
	customer_changed_mind: "bg-amber-50 text-amber-700 border border-amber-200",
	payment_failed: "bg-rose-50 text-rose-600 border border-rose-200",
	wrong_item: "bg-blue-50 text-blue-700 border border-blue-200",
	fraud_suspected: "bg-red-50 text-red-700 border border-red-200",
	system_error: "bg-purple-50 text-purple-700 border border-purple-200",
	other: "bg-slate-100 text-slate-500 border border-[#e5e5e5]",
};

export function formatCategoryLabel(raw: string | null | undefined): string {
	if (!raw) return "—";
	return REASON_CATEGORY_LABELS[raw] ?? raw;
}

export function formatCancellationTime(
	value: string | Date | null | undefined,
): { date: string; time: string } | null {
	if (!value) return null;
	const d = new Date(value);
	return {
		date: d.toLocaleDateString("en-MY", {
			day: "numeric",
			month: "short",
			year: "numeric",
		}),
		time: d.toLocaleTimeString("en-MY", {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}),
	};
}

export function cancelledInitials(name: string | null | undefined): string {
	if (!name) return "?";
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
