/**
 * Churn Waterfall (Plan F.2 — Agent V).
 *
 * Last-30d net MRR waterfall: starting MRR + new − churn = ending.
 * Rendered with the shadcn chart primitives (recharts BarChart).
 */

import { Bar, BarChart, Cell, LabelList, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";

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

const chartConfig = {
	value: { label: "MRR" },
	start: { label: "Start", color: "var(--color-brand-secondary-1)" },
	new: { label: "New", color: "#16a34a" },
	churn: { label: "Churn", color: "#dc2626" },
	end: { label: "End", color: "var(--color-brand-secondary-1)" },
} satisfies ChartConfig;

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

	const data = [
		{
			key: "start",
			label: "Start",
			value: startingMrr,
			fill: "var(--color-start)",
		},
		{ key: "new", label: "New", value: newMrr, fill: "var(--color-new)" },
		{
			key: "churn",
			label: "Churn",
			value: churnedMrr,
			fill: "var(--color-churn)",
		},
		{ key: "end", label: "End", value: endingMrr, fill: "var(--color-end)" },
	];

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
					<ChartContainer config={chartConfig} className="h-[180px] w-full">
						<BarChart accessibilityLayer data={data} margin={{ top: 20 }}>
							<XAxis
								dataKey="label"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								className="text-xs"
							/>
							<ChartTooltip
								cursor={false}
								content={
									<ChartTooltipContent
										formatter={(value) => dollars(Number(value))}
										hideIndicator
									/>
								}
							/>
							<Bar dataKey="value" radius={4}>
								{data.map((entry) => (
									<Cell key={entry.key} fill={entry.fill} />
								))}
								<LabelList
									dataKey="value"
									position="top"
									className="fill-muted-foreground"
									fontSize={10}
									formatter={(value: unknown) => dollars(Number(value))}
								/>
							</Bar>
						</BarChart>
					</ChartContainer>
				)}
				<div className="mt-2 text-xs text-muted-foreground flex justify-between">
					<span>
						Net Δ:{" "}
						<span
							className={
								netNewMrrLast30dCents >= 0 ? "text-green-700" : "text-red-700"
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
