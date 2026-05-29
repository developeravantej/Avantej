import { cancelledInitials, formatCategoryLabel, REASON_BADGE_CLASSES } from "@/features/sales/sales-view.constants";
import type { CancelledSaleRow } from "@/features/sales/sales-view.types";

export function CancelledAvatar({ name, size = "md" }: { name: string | null | undefined; size?: "sm" | "md" }) {
	const cls =
		size === "sm"
			? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e5e5e5] text-[10px] font-bold text-[#404040]"
			: "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e5e5e5] text-[11px] font-bold text-[#404040]";
	return <div className={cls}>{cancelledInitials(name)}</div>;
}

export function CustomerTypeBadge({ type }: { type: string }) {
	if (type === "member") {
		return (
			<span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
				Member
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 border border-[#e5e5e5]">
			Walk-in
		</span>
	);
}

export function ReasonBadge({ category }: { category: string | null | undefined }) {
	if (!category) return <span className="text-[#737373]">—</span>;
	const cls = REASON_BADGE_CLASSES[category] ?? "bg-muted/40 text-muted-foreground border border-border/50";
	return (
		<span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>
			{formatCategoryLabel(category)}
		</span>
	);
}

export function RefundStatusBadge({ row }: { row: CancelledSaleRow }) {
	const category = row.cancellationReasonCategory;
	if (category === "fraud_suspected") {
		return (
			<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 border border-[#e5e5e5]">
				None
			</span>
		);
	}
	if ((row.cancelledAmount ?? 0) > 0) {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
				<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
				Processed
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 border border-[#e5e5e5]">
			None
		</span>
	);
}
