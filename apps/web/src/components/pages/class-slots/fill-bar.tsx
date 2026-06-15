import { cn } from "@/lib/utils";
import { fillBarColor, fillPctColor } from "./helpers";

// ---------------------------------------------------------------------------
// Fill Rate Bar (inline in table)
// ---------------------------------------------------------------------------

interface FillBarProps {
	booked: number;
	capacity: number;
}

export function FillBar({ booked, capacity }: FillBarProps) {
	const pct = capacity > 0 ? Math.min((booked / capacity) * 100, 100) : 0;
	const pctRounded = Math.round(pct);

	return (
		<div className="flex items-center gap-2">
			<div className="h-1.5 w-20 flex-shrink-0 overflow-hidden rounded-full bg-[#e5e5e5]">
				<div
					className={cn(
						"h-full rounded-full transition-[width] duration-300",
						fillBarColor(pct),
					)}
					style={{ width: `${pct}%` }}
				/>
			</div>
			<span className={cn("font-mono tabular-nums text-xs", fillPctColor(pct))}>
				{pctRounded}%
			</span>
		</div>
	);
}
