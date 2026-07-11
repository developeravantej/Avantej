import { describe, test, expect } from "vitest";
import { trailingKpiRange } from "@/components/pages/reports/kpi-range";
import { WINDOW_LABELS } from "@/components/pages/reports/types";

// AVANTEJ-8 regression: the report presets used to map to calendar periods
// (this_week/this_month/this_year) whose `to` ran into the FUTURE — e.g. on
// 6 Jul, 30D showed "1 Jul – 1 Aug". A trailing window must end at *today*.
const NOW = new Date("2026-07-06T10:30:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("trailingKpiRange (AVANTEJ-8)", () => {
	test.each(
		WINDOW_LABELS,
	)("%s ends today (never in the future) and starts before it", (w) => {
		const { from, to } = trailingKpiRange(w, NOW);
		const fromT = new Date(from).getTime();
		const toT = new Date(to).getTime();
		expect(toT).toBeGreaterThanOrEqual(NOW.getTime());
		expect(toT).toBeLessThan(NOW.getTime() + DAY);
		expect(fromT).toBeLessThan(toT);
	});

	test("YTD starts on Jan 1 of the current year", () => {
		const { from } = trailingKpiRange("YTD", NOW);
		const d = new Date(from);
		expect(d.getMonth()).toBe(0);
		expect(d.getDate()).toBe(1);
	});

	test("7D spans roughly a week back from today, not forward", () => {
		const { from, to } = trailingKpiRange("7D", NOW);
		const span = (new Date(to).getTime() - new Date(from).getTime()) / DAY;
		expect(span).toBeGreaterThan(6.9);
		expect(span).toBeLessThan(8.1);
	});
});
