// ─── Types ────────────────────────────────────────────────────────────────────

export type WindowKey = "7D" | "30D" | "90D" | "YTD";

export const WINDOW_LABELS: WindowKey[] = ["7D", "30D", "90D", "YTD"];

// Map window to the period enum expected by getDashboardKpis
export const WINDOW_TO_PERIOD: Record<
	WindowKey,
	"today" | "this_week" | "this_month" | "this_year"
> = {
	"7D": "this_week",
	"30D": "this_month",
	"90D": "this_month",
	YTD: "this_year",
};

// Map window to days for getRevenueSeries (max 90 in the API)
export const WINDOW_TO_DAYS: Record<WindowKey, 7 | 30 | 90> = {
	"7D": 7,
	"30D": 30,
	"90D": 90,
	YTD: 90, // resolved dynamically below via ytdDays()
};

export interface CsvParams {
	window: WindowKey;
	kpis:
		| {
				totalSales: number;
				previousPeriodSales: number;
				activeMembersCount: number;
				completedAppointments: number;
				totalAppointments: number;
				from: Date | string;
				to: Date | string;
				revenueByBranch: { branchName: string | null; totalRevenue: number }[];
		  }
		| null
		| undefined;
	series: { date: string; revenueCents: number }[];
	topTrainers: {
		staffId: string;
		staffName: string | null;
		appointmentsCompleted: number;
		totalCommission: number;
	}[];
}
