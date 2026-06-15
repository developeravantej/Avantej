import { buildSparklinePaths } from "./chart-helpers";

interface KpiTileProps {
	label: string;
	value: string;
	delta: number | null; // percentage points or null
	deltaLabel?: string; // override label e.g. "pp" for percentage points
	sparkValues: number[];
	strokeColor: string;
	fillColor: string;
	stub?: boolean; // shows "—" with a stub notice
	noSparkline?: boolean; // hides the sparkline entirely (no synthetic data)
}

export function KpiTile({
	label,
	value,
	delta,
	deltaLabel = "%",
	sparkValues,
	strokeColor,
	fillColor,
	stub = false,
	noSparkline = false,
}: KpiTileProps) {
	const { line, area } = buildSparklinePaths(sparkValues);

	const hasDelta = delta !== null;
	const isPositive = delta !== null && delta >= 0;
	const absD = delta !== null ? Math.abs(delta).toFixed(1) : "—";

	return (
		<div
			className="rounded-2xl border p-5"
			style={{ background: "#fff", borderColor: "#e5e5e5" }}
		>
			<p
				className="mb-2 text-[10px] font-bold uppercase tracking-widest"
				style={{ color: "#737373" }}
			>
				{label}
			</p>
			<p
				className="font-mono text-2xl font-bold tabular-nums"
				style={{ color: "#0a0a0a" }}
			>
				{stub ? "—" : value}
			</p>
			<div className="mt-1 flex items-center gap-1.5">
				{stub ? (
					<span
						className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
						style={{ background: "#f5f0e8", color: "#78644a" }}
					>
						No data
					</span>
				) : hasDelta ? (
					<>
						<span
							className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
							style={{
								background: isPositive ? "#dcfce7" : "#fee2e2",
								color: isPositive ? "#15803d" : "#b91c1c",
							}}
						>
							{isPositive ? "▲" : "▼"} {absD}
							{deltaLabel}
						</span>
						<span className="text-[11px]" style={{ color: "#737373" }}>
							vs prev
						</span>
					</>
				) : (
					<span className="text-[11px]" style={{ color: "#a3a3a3" }}>
						vs prev
					</span>
				)}
			</div>
			{noSparkline ? (
				<p
					className="mt-3 font-mono text-[20px] font-bold"
					style={{ color: "#a3a3a3" }}
				>
					—
				</p>
			) : (
				<svg viewBox="0 0 80 24" className="mt-3 w-full" height="24">
					{area && (
						<polygon points={area} fill={fillColor} fillOpacity="0.10" />
					)}
					<polyline
						points={line}
						fill="none"
						stroke={strokeColor}
						strokeWidth="1.8"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
		</div>
	);
}
