// ─── Status badge (design tokens) ─────────────────────────────────────────────

export function RefundBadge({ status }: { status: string }) {
	const map: Record<string, string> = {
		pending:
			"bg-white text-[#4a4f51] border border-[#e5e5e5]",
		approved:
			"bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]",
		processed:
			"bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]",
		rejected:
			"bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca]",
		cancelled: "bg-[#d9d9ca] text-[#4a4f51]",
	};
	const cls = map[status] ?? "bg-[#d9d9ca] text-[#4a4f51]";
	const label =
		status === "processed"
			? "Paid"
			: status.charAt(0).toUpperCase() + status.slice(1);
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-[11px] font-medium leading-[1.4] ${cls}`}
		>
			{label}
		</span>
	);
}
