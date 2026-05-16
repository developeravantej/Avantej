/**
 * Platform Admin — Big Number Card (Plan F.1.5 — Agent M).
 *
 * Mission-control kpi tile. Title at top, large number, optional
 * sub-label, optional color band for danger/warning emphasis.
 */

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export type BigNumberBand = "neutral" | "green" | "amber" | "red";

const BAND_RING: Record<BigNumberBand, string> = {
	neutral: "",
	green: "ring-1 ring-green-200 dark:ring-green-900/40",
	amber: "ring-1 ring-amber-200 dark:ring-amber-900/40",
	red: "ring-1 ring-red-200 dark:ring-red-900/40",
};

const BAND_FG: Record<BigNumberBand, string> = {
	neutral: "",
	green: "text-green-700 dark:text-green-400",
	amber: "text-amber-700 dark:text-amber-400",
	red: "text-red-700 dark:text-red-400",
};

export function BigNumberCard({
	title,
	value,
	subLabel,
	band = "neutral",
	icon,
	testId,
}: {
	title: string;
	value: ReactNode;
	subLabel?: ReactNode;
	band?: BigNumberBand;
	icon?: ReactNode;
	testId?: string;
}) {
	return (
		<Card className={BAND_RING[band]} data-testid={testId}>
			<CardContent className="p-4">
				<div className="flex items-center justify-between">
					<div className="text-xs uppercase tracking-wide text-muted-foreground">
						{title}
					</div>
					{icon ? <div className="text-muted-foreground">{icon}</div> : null}
				</div>
				<div
					className={`mt-2 text-3xl font-semibold tabular-nums ${BAND_FG[band]}`}
					data-testid={testId ? `${testId}-value` : undefined}
				>
					{value}
				</div>
				{subLabel ? (
					<div className="mt-1 text-xs text-muted-foreground">{subLabel}</div>
				) : null}
			</CardContent>
		</Card>
	);
}
