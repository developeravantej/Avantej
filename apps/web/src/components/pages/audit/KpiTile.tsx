import type { ElementType } from "react";

// ─── KPI tile ─────────────────────────────────────────────────────────────────

interface KpiTileProps {
	icon: ElementType;
	label: string;
	value: number | string;
	valueClass?: string;
	isLoading?: boolean;
}

export function KpiTile({
	icon: Icon,
	label,
	value,
	valueClass = "text-[#0a0a0a]",
	isLoading,
}: KpiTileProps) {
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
			<div className="flex items-center gap-2 mb-1">
				<Icon className="h-3.5 w-3.5 text-[#737373]" />
				<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
					{label}
				</p>
			</div>
			{isLoading ? (
				<div className="h-7 w-16 rounded bg-[#e5e5e5] animate-pulse mt-1" />
			) : (
				<p
					className={`mt-1 text-2xl font-bold font-mono tabular-nums ${valueClass}`}
				>
					{value}
				</p>
			)}
		</div>
	);
}
