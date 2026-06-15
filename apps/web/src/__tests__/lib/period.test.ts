import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPeriodDates } from "@/lib/period";

// Fixed "now": noon local on 2026-05-15
const FIXED = new Date(2026, 4, 15, 12, 0, 0);

describe("getPeriodDates", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(FIXED);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("today returns the same from/to as the current local day", () => {
		expect(getPeriodDates("today")).toEqual({
			from: "2026-05-15",
			to: "2026-05-15",
		});
	});

	it("this_month spans the first to last day of the month", () => {
		expect(getPeriodDates("this_month")).toEqual({
			from: "2026-05-01",
			to: "2026-05-31",
		});
	});

	it("this_year spans Jan 1 to Dec 31", () => {
		expect(getPeriodDates("this_year")).toEqual({
			from: "2026-01-01",
			to: "2026-12-31",
		});
	});

	it("this_week spans Monday to the following Sunday and contains today", () => {
		const { from, to } = getPeriodDates("this_week");
		const fromDate = new Date(`${from}T00:00:00`);
		const toDate = new Date(`${to}T00:00:00`);
		expect(fromDate.getDay()).toBe(1); // Monday
		expect(toDate.getDay()).toBe(0); // Sunday
		// 6-day span
		const spanDays = Math.round(
			(toDate.getTime() - fromDate.getTime()) / 86_400_000,
		);
		expect(spanDays).toBe(6);
		// today (the 15th) falls within the range
		expect(from <= "2026-05-15").toBe(true);
		expect("2026-05-15" <= to).toBe(true);
	});
});
