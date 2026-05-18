/**
 * Churn Waterfall (Plan F.2 — Agent V).
 *
 * Last-30d net MRR waterfall: starting MRR + new − churn = ending.
 * Inline SVG, no charting library (mirrors Agent R's sparkline pattern).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ChurnWaterfallProps = {
	mrrCents: number; // current/ending MRR
	netNewMrrLast30dCents: number; // net change in last 30d
	churnedMrrLast30dCents: number; // for visual decomposition (optional)
	newMrrLast30dCents: number; // for visual decomposition (optional)
};

function dollars(cents: number): string {
	const sign = cents < 0 ? "-" : "";
	const abs = Math.abs(cents);
	return `${sign}$${(abs / 100).toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})}`;
}

export function ChurnWaterfall({
	mrrCents,
	netNewMrrLast30dCents,
	churnedMrrLast30dCents,
	newMrrLast30dCents,
}: ChurnWaterfallProps) {
	// Derive starting MRR from ending - net change.
	const endingMrr = mrrCents;
	const startingMrr = endingMrr - netNewMrrLast30dCents;
	const newMrr = newMrrLast30dCents;
	const churnedMrr = churnedMrrLast30dCents;

	const noMovement = newMrr === 0 && churnedMrr === 0;

	// SVG sizing.
	const W = 380;
	const H = 140;
	const padL = 8;
	const padR = 8;
	const padT = 12;
	const padB = 32;
	const innerW = W - padL - padR;
	const innerH = H - padT - padB;
	const barCount = 4;
	const gap = 12;
	const barW = (innerW - gap * (barCount - 1)) / barCount;

	// Scale: cap at max of (start, end, end+churnedMrr).
	const maxVal = Math.max(
		startingMrr,
		endingMrr,
		startingMrr + newMrr,
		1, // avoid div-by-zero
	);

	function h(v: number): number {
		return Math.max(0, (v / maxVal) * innerH);
	}

	const bars = [
		{ label: "Start", y0: 0, value: startingMrr, color: "#94a3b8" },
		{ label: "New", y0: startingMrr, value: newMrr, color: "#22c55e" },
		{
			label: "Churn",
			y0: startingMrr + newMrr - churnedMrr,
			value: churnedMrr,
			color: "#ef4444",
		},
		{ label: "End", y0: 0, value: endingMrr, color: "#94a3b8" },
	];

	const baseY = padT + innerH;

	return (
		<Card data-testid="churn-waterfall">
			<CardHeader>
				<CardTitle className="text-base">30-day MRR movement</CardTitle>
				<p className="text-xs text-muted-foreground mt-1">
					Starting MRR + new − churn = ending MRR.
				</p>
			</CardHeader>
			<CardContent>
				{noMovement ? (
					<div
						className="text-sm text-muted-foreground py-6 text-center"
						data-testid="churn-waterfall-empty"
					>
						No MRR movement in last 30 days.
					</div>
				) : (
					<svg
						viewBox={`0 0 ${W} ${H}`}
						className="w-full h-auto"
						role="img"
						aria-label="30-day MRR waterfall"
					>
						{/* Base line */}
						<line
							x1={padL}
							y1={baseY}
							x2={W - padR}
							y2={baseY}
							stroke="currentColor"
							strokeOpacity={0.2}
						/>
						{bars.map((b, i) => {
							const x = padL + i * (barW + gap);
							const barH = h(b.value);
							const y = baseY - barH - h(b.y0);
							return (
								<g key={b.label}>
									<rect
										x={x}
										y={y < padT ? padT : y}
										width={barW}
										height={barH}
										fill={b.color}
										opacity={0.85}
										rx={2}
									/>
									<text
										x={x + barW / 2}
										y={baseY + 14}
										textAnchor="middle"
										fontSize="10"
										fill="currentColor"
										opacity={0.7}
									>
										{b.label}
									</text>
									<text
										x={x + barW / 2}
										y={baseY + 26}
										textAnchor="middle"
										fontSize="9"
										fill="currentColor"
										opacity={0.55}
									>
										{dollars(b.value)}
									</text>
								</g>
							);
						})}
					</svg>
				)}
				<div className="mt-2 text-xs text-muted-foreground flex justify-between">
					<span>
						Net Δ:{" "}
						<span
							className={
								netNewMrrLast30dCents >= 0
									? "text-green-700 dark:text-green-400"
									: "text-red-700 dark:text-red-400"
							}
							data-testid="churn-waterfall-net"
						>
							{dollars(netNewMrrLast30dCents)}
						</span>
					</span>
				</div>
			</CardContent>
		</Card>
	);
}
