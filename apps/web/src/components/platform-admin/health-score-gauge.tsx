/**
 * Platform Admin — Health Score Gauge (Plan F.1.5, Agent R).
 *
 * Big numeric readout of a 0-100 tenant health score with a colored
 * status band. Null score → grey "No data" placeholder. No external
 * chart deps — hand-rolled CSS only.
 */

export type HealthBand = "green" | "amber" | "red" | "none";

export function bandForScore(score: number | null): HealthBand {
	if (score == null) return "none";
	if (score >= 80) return "green";
	if (score >= 50) return "amber";
	return "red";
}

const BAND_STYLE: Record<HealthBand, { fg: string; bg: string; label: string }> =
	{
		green: {
			fg: "text-green-700 dark:text-green-400",
			bg: "bg-green-100 dark:bg-green-900/30",
			label: "Healthy",
		},
		amber: {
			fg: "text-amber-700 dark:text-amber-400",
			bg: "bg-amber-100 dark:bg-amber-900/30",
			label: "At risk",
		},
		red: {
			fg: "text-red-700 dark:text-red-400",
			bg: "bg-red-100 dark:bg-red-900/30",
			label: "Critical",
		},
		none: {
			fg: "text-muted-foreground",
			bg: "bg-muted",
			label: "No data",
		},
	};

export function HealthScoreGauge({
	score,
	snapshotDate,
}: {
	score: number | null;
	snapshotDate: string | null;
}) {
	const band = bandForScore(score);
	const style = BAND_STYLE[band];
	const showNumber = score != null;
	return (
		<div
			className={`rounded-md p-6 flex items-center gap-6 ${style.bg}`}
			data-testid="health-score-gauge"
			data-band={band}
			data-score={score == null ? "" : String(score)}
		>
			<div className="flex flex-col items-center">
				<div
					className={`text-6xl font-semibold tabular-nums leading-none ${style.fg}`}
					data-testid="health-score-value"
				>
					{showNumber ? score : "—"}
				</div>
				<div
					className={`text-xs uppercase tracking-wide mt-2 ${style.fg}`}
					data-testid="health-score-band"
				>
					{style.label}
				</div>
			</div>
			<div className="text-sm text-muted-foreground flex-1">
				<div>Composite health score (0-100).</div>
				<div className="text-xs">
					{snapshotDate
						? `As of ${snapshotDate}`
						: "No daily snapshot yet — health score will appear once the cron runs."}
				</div>
				<div className="text-xs mt-1">
					Bands: 80-100 healthy · 50-79 at risk · 0-49 critical.
				</div>
			</div>
		</div>
	);
}

export default HealthScoreGauge;
