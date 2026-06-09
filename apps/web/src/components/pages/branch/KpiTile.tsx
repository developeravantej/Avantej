// ─── KPI Tile ───────────────────────────────────────────────────────────────────

export function KpiTile({
	label,
	value,
	sub,
	stale,
}: {
	label: string;
	value: string;
	sub?: string;
	stale?: boolean;
}) {
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 text-center">
			<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373] mb-1">
				{label}
			</div>
			<div
				className="text-2xl font-bold tabular-nums font-mono text-[#0a0a0a]"
				title={
					stale ? "Cache warming — data may be up to 5 min old" : undefined
				}
			>
				{stale && value === "—" ? (
					<span className="text-[#737373] text-xl">—</span>
				) : (
					value
				)}
			</div>
			{sub && <div className="text-xs mt-1 text-[#737373]">{sub}</div>}
		</div>
	);
}
