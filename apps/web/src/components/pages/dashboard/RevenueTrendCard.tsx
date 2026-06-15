import { AlertTriangle } from "lucide-react";
import { AreaChart, Area, XAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { formatPrice } from "@/lib/money";
import type { DashboardKpisResult } from "@avantej-core/services";

import { TrendStat } from "./TrendStat";
import { revenueChartConfig } from "./types";

interface RevenueTrendCardProps {
	period: string;
	trendDays: number;
	kpis: DashboardKpisResult | undefined;
	periodDays: number;
	revenueDelta: number | null;
	revenueChartData: { day: number; revenue: number }[];
	kpisError: boolean;
	onRetryKpis: () => void;
	revenueSeriesLoading: boolean;
	revenueSeriesError: boolean;
	onRetryRevenueSeries: () => void;
}

export function RevenueTrendCard({
	period,
	trendDays,
	kpis,
	periodDays,
	revenueDelta,
	revenueChartData,
	kpisError,
	onRetryKpis,
	revenueSeriesLoading,
	revenueSeriesError,
	onRetryRevenueSeries,
}: RevenueTrendCardProps) {
	return (
		<div className="col-span-12 rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md lg:col-span-8">
			<div className="mb-5 flex items-start justify-between">
				<div>
					<div className="text-sm font-semibold">Revenue trend</div>
					<div className="mt-0.5 text-xs text-muted-foreground">
						{period === "today"
							? "Today · all branches"
							: period === "this_week"
								? "Last 7 days · all branches"
								: period === "this_year"
									? "Last 365 days · all branches"
									: "Last 30 days · all branches"}
					</div>
				</div>
			</div>

			{kpisError ? (
				<div className="flex items-center gap-2 py-4 text-destructive text-sm">
					<AlertTriangle className="size-4 shrink-0" />
					<span>Failed to load revenue data.</span>
					<button
						type="button"
						onClick={() => {
							void onRetryKpis();
							void onRetryRevenueSeries();
						}}
						className="underline underline-offset-2 hover:opacity-70"
					>
						Retry
					</button>
				</div>
			) : (
				<>
					<div className="mb-5 grid grid-cols-3 gap-6">
						<TrendStat
							label="This period"
							value={formatPrice(kpis?.totalSales ?? 0, "MYR")}
							tooltip="Total revenue collected in the selected period"
						/>
						<TrendStat
							label="Avg / day"
							value={formatPrice(
								Math.round((kpis?.totalSales ?? 0) / periodDays),
								"MYR",
							)}
							tooltip={`Daily average over ${periodDays} day${periodDays === 1 ? "" : "s"}`}
						/>
						<TrendStat
							label="vs prev"
							value={
								revenueDelta !== null
									? `${revenueDelta >= 0 ? "+" : ""}${revenueDelta.toFixed(1)}%`
									: "—"
							}
							tone={
								revenueDelta === null
									? undefined
									: revenueDelta >= 0
										? "green"
										: "red"
							}
							tooltip="Change vs. the same-length period immediately before"
						/>
					</div>

					{revenueSeriesLoading ? (
						<Skeleton className="h-40 w-full" />
					) : revenueSeriesError ? (
						<div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] text-destructive text-sm">
							<AlertTriangle className="size-4 shrink-0" />
							<span>Chart failed to load.</span>
							<button
								type="button"
								onClick={onRetryRevenueSeries}
								className="underline underline-offset-2 hover:opacity-70"
							>
								Retry
							</button>
						</div>
					) : (
						<ChartContainer
							config={revenueChartConfig}
							className="!aspect-auto h-40 w-full"
						>
							<AreaChart
								data={revenueChartData}
								margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
							>
								<defs>
									<linearGradient id="trendgrad" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0%" stopColor="#0a0a0a" stopOpacity={0.18} />
										<stop offset="100%" stopColor="#0a0a0a" stopOpacity={0} />
									</linearGradient>
								</defs>
								<XAxis dataKey="day" hide />
								<ChartTooltip
									content={
										<ChartTooltipContent
											formatter={(value) => formatPrice(Number(value), "MYR")}
											hideLabel
										/>
									}
								/>
								<Area
									type="monotone"
									dataKey="revenue"
									stroke="#0a0a0a"
									strokeWidth={2}
									fill="url(#trendgrad)"
									dot={false}
								/>
							</AreaChart>
						</ChartContainer>
					)}
					<div className="mt-2 flex justify-between text-[10px] font-medium text-[#a3a3a3]">
						<span>
							{period === "today" ? "Start of day" : `${trendDays}d ago`}
						</span>
						{period !== "today" && (
							<>
								<span>{Math.round((trendDays * 3) / 4)}d ago</span>
								<span>{Math.round(trendDays / 2)}d ago</span>
								<span>{Math.round(trendDays / 4)}d ago</span>
							</>
						)}
						<span>Today</span>
					</div>
				</>
			)}
		</div>
	);
}
