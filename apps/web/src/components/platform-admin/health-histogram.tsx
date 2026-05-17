/**
 * Platform Admin — Health Histogram (Plan F.4 — Agent He).
 *
 * 5-band vertical bar chart of current tenant health scores. Bands are
 * fixed 0-19 / 20-39 / 40-59 / 60-79 / 80-100 with red/red/amber/amber/
 * green coloring. Bar height = count proportional to max band count.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type Band = {
	label: string;
	min: number;
	max: number;
	count: number;
	color: "red" | "amber" | "green";
};

const BAND_FILL: Record<Band["color"], string> = {
	red: "bg-red-500 dark:bg-red-600",
	amber: "bg-amber-500 dark:bg-amber-500",
	green: "bg-green-500 dark:bg-green-600",
};

export function HealthHistogram({
	bands,
	totalScoredOrgs,
	unscoredOrgs,
}: {
	bands: Band[];
	totalScoredOrgs: number;
	unscoredOrgs: number;
}) {
	const maxCount = Math.max(1, ...bands.map((b) => b.count));

	return (
		<Card data-testid="health-histogram">
			<CardHeader className="pb-2">
				<CardTitle className="text-base">Health score distribution</CardTitle>
				<div className="text-xs text-muted-foreground">
					{totalScoredOrgs} scored · {unscoredOrgs} unscored
				</div>
			</CardHeader>
			<CardContent>
				{totalScoredOrgs === 0 ? (
					<div
						className="text-sm text-muted-foreground text-center py-8"
						data-testid="health-histogram-empty"
					>
						No scored tenants yet. Histogram populates once the daily snapshot
						cron has run.
					</div>
				) : (
					<div
						className="flex items-end justify-between gap-3 h-40"
						data-testid="health-histogram-bars"
					>
						{bands.map((b) => {
							const pct = (b.count / maxCount) * 100;
							const heightPct = Math.max(b.count > 0 ? 6 : 1.5, pct);
							const sharePct =
								totalScoredOrgs > 0
									? Math.round((b.count / totalScoredOrgs) * 1000) / 10
									: 0;
							return (
								<div
									key={b.label}
									className="flex-1 flex flex-col items-center gap-1.5 min-w-0"
									data-testid="health-histogram-band"
									data-band-label={b.label}
									data-band-color={b.color}
									data-band-count={b.count}
								>
									<div
										className="text-xs font-mono tabular-nums"
										data-testid="health-histogram-count"
									>
										{b.count}
									</div>
									<div className="w-full flex-1 flex items-end">
										<div
											className={`w-full rounded-t-md ${BAND_FILL[b.color]} transition-all`}
											style={{ height: `${heightPct}%` }}
											title={`${b.count} tenant${
												b.count === 1 ? "" : "s"
											} (${sharePct}%) scored ${b.label}`}
										/>
									</div>
									<div className="text-xs text-muted-foreground tabular-nums">
										{b.label}
									</div>
									<div className="text-[10px] text-muted-foreground">
										{sharePct}%
									</div>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export default HealthHistogram;
