/**
 * Platform Admin — Health Sparkline (Plan F.1.5, Agent R).
 *
 * Inline SVG sparkline of the 30-day health-score series returned by
 * `platformAdminTenants.health.history`. No chart library — the dataset
 * is ≤30 points so a polyline + a couple of axis lines is plenty.
 *
 * Y axis is fixed 0-100 with the same green/amber/red bands the gauge
 * uses. X axis is days ago (left = oldest). Current value labeled at
 * the right edge. <2 points → "not enough data" placeholder.
 */

import { bandForScore } from "./health-score-gauge";

export type HealthPoint = {
	snapshotDate: string;
	healthScore: number | null;
};

const WIDTH = 600;
const HEIGHT = 140;
const PAD_X = 28;
const PAD_Y = 12;

function yFor(score: number): number {
	const clamped = Math.max(0, Math.min(100, score));
	const usable = HEIGHT - PAD_Y * 2;
	return PAD_Y + (1 - clamped / 100) * usable;
}

function xFor(i: number, n: number): number {
	if (n <= 1) return PAD_X;
	const usable = WIDTH - PAD_X * 2;
	return PAD_X + (i / (n - 1)) * usable;
}

const BAND_COLORS: Record<ReturnType<typeof bandForScore>, string> = {
	green: "stroke-green-500",
	amber: "stroke-amber-500",
	red: "stroke-red-500",
	none: "stroke-muted-foreground",
};

export function HealthSparkline({ points }: { points: HealthPoint[] }) {
	const valid = (points ?? []).filter(
		(p): p is { snapshotDate: string; healthScore: number } =>
			typeof p.healthScore === "number",
	);

	if (valid.length < 2) {
		return (
			<div
				className="text-sm text-muted-foreground border rounded-md p-4 text-center"
				data-testid="health-sparkline-empty"
			>
				Not enough data — health trend will appear after 2+ days of snapshots.
			</div>
		);
	}

	const lastScore = valid[valid.length - 1]!.healthScore;
	const lastBand = bandForScore(lastScore);
	const polylinePoints = valid
		.map((p, i) => `${xFor(i, valid.length).toFixed(2)},${yFor(p.healthScore).toFixed(2)}`)
		.join(" ");

	// Horizontal band thresholds at y=80 (green floor) and y=50 (amber floor).
	const y80 = yFor(80);
	const y50 = yFor(50);

	return (
		<div
			className="w-full overflow-x-auto"
			data-testid="health-sparkline"
			data-points={valid.length}
			data-last-score={lastScore}
		>
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				width="100%"
				height={HEIGHT}
				role="img"
				aria-label={`Health-score sparkline, latest ${lastScore}`}
				preserveAspectRatio="none"
			>
				<title>{`Health score over ${valid.length} day(s); latest ${lastScore}`}</title>
				{/* Background bands */}
				<rect
					x={PAD_X}
					y={PAD_Y}
					width={WIDTH - PAD_X * 2}
					height={y80 - PAD_Y}
					className="fill-green-500/10"
				/>
				<rect
					x={PAD_X}
					y={y80}
					width={WIDTH - PAD_X * 2}
					height={y50 - y80}
					className="fill-amber-500/10"
				/>
				<rect
					x={PAD_X}
					y={y50}
					width={WIDTH - PAD_X * 2}
					height={HEIGHT - PAD_Y - y50}
					className="fill-red-500/10"
				/>
				{/* Y axis labels */}
				<text
					x={4}
					y={PAD_Y + 4}
					className="fill-muted-foreground text-[10px]"
				>
					100
				</text>
				<text
					x={4}
					y={HEIGHT - PAD_Y}
					className="fill-muted-foreground text-[10px]"
				>
					0
				</text>
				<text
					x={4}
					y={yFor(50) + 3}
					className="fill-muted-foreground text-[10px]"
				>
					50
				</text>
				{/* Polyline */}
				<polyline
					points={polylinePoints}
					fill="none"
					strokeWidth={2}
					className={BAND_COLORS[lastBand]}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				{/* Point dots */}
				{valid.map((p, i) => (
					<circle
						key={`${p.snapshotDate}-${i}`}
						cx={xFor(i, valid.length)}
						cy={yFor(p.healthScore)}
						r={2.5}
						className={`${BAND_COLORS[bandForScore(p.healthScore)]} fill-background`}
					/>
				))}
				{/* Current value label */}
				<text
					x={xFor(valid.length - 1, valid.length) - 4}
					y={yFor(lastScore) - 8}
					textAnchor="end"
					className="fill-foreground text-[11px] font-medium"
					data-testid="health-sparkline-last-label"
				>
					{lastScore}
				</text>
			</svg>
			<div className="flex justify-between text-[10px] text-muted-foreground px-1">
				<span>{valid[0]!.snapshotDate}</span>
				<span>{valid[valid.length - 1]!.snapshotDate}</span>
			</div>
		</div>
	);
}

export default HealthSparkline;
