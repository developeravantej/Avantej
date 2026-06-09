import { cn } from "@/lib/utils";
import type { SlotStatus } from "./types";

// ---------------------------------------------------------------------------
// Status badge (Design 3 style — flat pill)
// ---------------------------------------------------------------------------

export function SlotStatusBadge({ status }: { status: SlotStatus }) {
	const map: Record<SlotStatus, { cls: string; label: string }> = {
		open: {
			cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
			label: "Open",
		},
		full: {
			cls: "bg-red-50 text-red-700 border border-red-200",
			label: "Full",
		},
		waitlist: {
			cls: "bg-amber-50 text-amber-700 border border-amber-200",
			label: "Waitlist",
		},
		cancelled: {
			cls: "bg-[#f3f3f3] text-[#737373] border border-[#e5e5e5]",
			label: "Cancelled",
		},
	};
	const { cls, label } = map[status];
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
				cls,
			)}
		>
			{label}
		</span>
	);
}
