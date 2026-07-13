import { WINDOW_TO_DAYS, type WindowKey } from "./types";

/**
 * AVANTEJ-8: the report KPI window is a TRAILING window ending *today*, not a
 * calendar period (this_week/this_month/this_year) — those extended the header
 * into the future (e.g. 7D → "5 Jul – 12 Jul") and contradicted the "Last N days"
 * chart. Returns an ISO {from,to} range whose `to` is end-of-today. `now` is
 * injectable for deterministic tests.
 */
export function trailingKpiRange(
	window: WindowKey,
	now: Date = new Date(),
): { from: string; to: string } {
	const to = new Date(now);
	to.setHours(23, 59, 59, 999);
	const from = new Date(to);
	if (window === "YTD") {
		from.setMonth(0, 1); // Jan 1 of the current year
	} else {
		from.setDate(to.getDate() - WINDOW_TO_DAYS[window]);
	}
	from.setHours(0, 0, 0, 0);
	return { from: from.toISOString(), to: to.toISOString() };
}
