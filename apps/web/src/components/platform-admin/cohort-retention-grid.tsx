/**
 * Cohort Retention Grid (Plan F.2 — Agent V).
 *
 * Signup-month rows × month-index columns. Each cell = retention %
 * (retained / cohortSize × 100). Color band: ≥80 green, 50-79 amber,
 * <50 red. Future months (k > monthsSinceCohort) render empty.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type CohortRow = {
	cohortMonth: string;
	cohortSize: number;
	retained: number[];
};

export type CohortRetentionGridProps = {
	cohorts: CohortRow[];
	maxMonthIndex?: number; // default 12 — column count
};

function bandClass(pct: number): string {
	if (pct >= 80) return "bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300";
	if (pct >= 50) return "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
	return "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300";
}

export function CohortRetentionGrid({
	cohorts,
	maxMonthIndex = 12,
}: CohortRetentionGridProps) {
	// Sort newest-first to put recent cohorts at the top.
	const sorted = [...cohorts].sort((a, b) =>
		b.cohortMonth.localeCompare(a.cohortMonth),
	);

	const colIndices = Array.from({ length: maxMonthIndex + 1 }, (_, i) => i);

	return (
		<Card data-testid="cohort-retention-grid">
			<CardHeader>
				<CardTitle className="text-base">Cohort retention</CardTitle>
				<p className="text-xs text-muted-foreground mt-1">
					% of orgs still active at month N after signup.
				</p>
			</CardHeader>
			<CardContent className="overflow-x-auto">
				{sorted.length === 0 ? (
					<div className="text-sm text-muted-foreground py-6 text-center">
						No cohort data yet.
					</div>
				) : (
					<table
						className="w-full text-xs border-collapse"
						data-testid="cohort-table"
					>
						<thead>
							<tr className="border-b">
								<th className="sticky left-0 z-10 bg-background text-left font-medium px-2 py-1.5">
									Cohort
								</th>
								<th className="text-right font-medium px-2 py-1.5">
									Size
								</th>
								{colIndices.map((k) => (
									<th
										key={k}
										className="text-center font-medium px-2 py-1.5 text-muted-foreground"
									>
										M{k}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{sorted.map((row) => (
								<tr
									key={row.cohortMonth}
									className="border-b last:border-0"
									data-testid="cohort-row"
								>
									<td className="sticky left-0 z-10 bg-background font-mono px-2 py-1.5">
										{row.cohortMonth}
									</td>
									<td className="text-right tabular-nums px-2 py-1.5">
										{row.cohortSize}
									</td>
									{colIndices.map((k) => {
										const has = k < row.retained.length;
										if (!has) {
											return (
												<td
													key={k}
													className="text-center px-2 py-1.5 text-muted-foreground/40"
												>
													·
												</td>
											);
										}
										if (row.cohortSize === 0) {
											return (
												<td
													key={k}
													className="text-center px-2 py-1.5 text-muted-foreground/40"
												>
													—
												</td>
											);
										}
										const pct = Math.round(
											(row.retained[k]! / row.cohortSize) * 100,
										);
										return (
											<td
												key={k}
												className={`text-center px-2 py-1.5 tabular-nums ${bandClass(
													pct,
												)}`}
												data-testid="cohort-cell"
											>
												{pct}%
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				)}
			</CardContent>
		</Card>
	);
}
