import type { ChartConfig } from "@/components/ui/chart";

export type Period = "today" | "this_week" | "this_month" | "this_year";

export const PERIODS: { value: Period; label: string }[] = [
	{ value: "today", label: "Today" },
	{ value: "this_week", label: "Week" },
	{ value: "this_month", label: "Month" },
	{ value: "this_year", label: "Year" },
];

export const revenueChartConfig = {
	revenue: { label: "Revenue (MYR)", color: "#0a0a0a" },
} satisfies ChartConfig;
