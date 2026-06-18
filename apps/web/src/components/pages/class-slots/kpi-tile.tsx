import type React from "react";
import { cn } from "@/lib/utils";
import { fillBarColor } from "./helpers";

// ---------------------------------------------------------------------------
// KPI Tile
// ---------------------------------------------------------------------------

interface KpiTileProps {
	label: string;
	value: React.ReactNode;
	sub?: React.ReactNode;
	fillPct?: number; // if set, renders a fill bar below the value
	accent?: "default" | "amber" | "red";
}

export function KpiTile({
	label,
	value,
	sub,
	fillPct,
	accent = "default",
}: KpiTileProps) {
	const valueColor =
		accent === "amber"
			? "text-amber-600"
			: accent === "red"
				? "text-red-600"
				: "text-[#0a0a0a]";

	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
			<p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373] mb-2">
				{label}
			</p>
			<p
				className={cn(
					"font-mono tabular-nums text-3xl font-extrabold",
					valueColor,
				)}
			>
				{value}
			</p>
			{fillPct !== undefined && (
				<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e5e5e5]">
					<div
						className={cn(
							"h-full rounded-full transition-[width] duration-300",
							fillBarColor(fillPct),
						)}
						style={{ width: `${Math.min(fillPct, 100)}%` }}
					/>
				</div>
			)}
			{sub && <p className="mt-1.5 text-xs text-[#737373]">{sub}</p>}
		</div>
	);
}
