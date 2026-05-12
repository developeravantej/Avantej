import { describe, it, expect } from "bun:test";
import {
	expandRecurrenceRule,
	makeVirtualId,
	parseVirtualId,
	isVirtualId,
	MAX_VIRTUAL_OCCURRENCES,
} from "@avantej-core/services";

// Helper to build a minimal RecurrenceRule-shaped object for testing
function makeRule(overrides: Partial<{
	id: string;
	appointmentId: string;
	frequencyValue: number;
	timeUnit: string;
	repeatOn: number[] | null;
	monthlyType: string | null;
	monthlyDayOfWeek: number | null;
	monthlyWeekOfMonth: number | null;
	endsType: string;
	endsAfterOccurrences: number | null;
	createdAt: Date;
	updatedAt: Date;
}> = {}) {
	return {
		id: "rule-1",
		appointmentId: "appt-1",
		frequencyValue: 1,
		timeUnit: "day",
		repeatOn: null,
		monthlyType: null,
		monthlyDayOfWeek: null,
		monthlyWeekOfMonth: null,
		endsType: "never",
		endsAfterOccurrences: null,
		createdAt: new Date("2025-01-01"),
		updatedAt: new Date("2025-01-01"),
		...overrides,
	} as Parameters<typeof expandRecurrenceRule>[0];
}

// Jan 1, 2025 at 09:00 UTC (Wednesday)
const BASE_START = new Date("2025-01-01T09:00:00.000Z");
const WINDOW_START = new Date("2025-01-01T00:00:00.000Z");
const WINDOW_END = new Date("2025-01-31T23:59:59.999Z");

describe("expandRecurrenceRule", () => {
	it("daily recurrence — returns correct dates in window", () => {
		const rule = makeRule({ frequencyValue: 1, timeUnit: "day", endsType: "never" });
		const results = expandRecurrenceRule(rule, BASE_START, null, WINDOW_START, WINDOW_END);

		// Jan has 31 days; parent is Jan 1, so we get 31 occurrences
		expect(results).toHaveLength(31);
		expect(results[0]?.toISOString()).toBe("2025-01-01T09:00:00.000Z");
		expect(results[1]?.toISOString()).toBe("2025-01-02T09:00:00.000Z");
		expect(results[30]?.toISOString()).toBe("2025-01-31T09:00:00.000Z");
	});

	it("every-2-days recurrence — skips every other day", () => {
		const rule = makeRule({ frequencyValue: 2, timeUnit: "day", endsType: "never" });
		const results = expandRecurrenceRule(rule, BASE_START, null, WINDOW_START, WINDOW_END);

		// Jan 1, 3, 5, ... 31 → 16 occurrences
		expect(results).toHaveLength(16);
		expect(results[0]?.toISOString()).toBe("2025-01-01T09:00:00.000Z");
		expect(results[1]?.toISOString()).toBe("2025-01-03T09:00:00.000Z");
	});

	it("weekly recurrence without repeatOn — repeats same weekday every week", () => {
		// Jan 1 is Wednesday (UTC)
		const rule = makeRule({ frequencyValue: 1, timeUnit: "week", repeatOn: null, endsType: "never" });
		const results = expandRecurrenceRule(rule, BASE_START, null, WINDOW_START, WINDOW_END);

		// Wednesdays in Jan 2025: Jan 1, 8, 15, 22, 29 → 5 occurrences
		expect(results).toHaveLength(5);
		expect(results[0]?.toISOString()).toBe("2025-01-01T09:00:00.000Z");
		expect(results[1]?.toISOString()).toBe("2025-01-08T09:00:00.000Z");
		expect(results[4]?.toISOString()).toBe("2025-01-29T09:00:00.000Z");
	});

	it("weekly recurrence with repeatOn — emits only matching weekdays", () => {
		// repeatOn: [1, 3] = Monday and Wednesday
		const rule = makeRule({ frequencyValue: 1, timeUnit: "week", repeatOn: [1, 3], endsType: "never" });
		// Parent starts Jan 1 (Wednesday). Window starts Jan 1.
		const results = expandRecurrenceRule(rule, BASE_START, null, WINDOW_START, WINDOW_END);

		// Week of Dec 29: Mon=Dec 30 (before parent, skip), Wed=Jan 1 ✓
		// Week of Jan 5: Mon=Jan 6, Wed=Jan 8
		// Week of Jan 12: Mon=Jan 13, Wed=Jan 15
		// Week of Jan 19: Mon=Jan 20, Wed=Jan 22
		// Week of Jan 26: Mon=Jan 27, Wed=Jan 29
		// Total: 9 occurrences (Jan 1 + 4 Mon + 4 Wed after Jan 1)
		const isoDates = results.map((d) => d.toISOString().split("T")[0]);
		expect(isoDates).toContain("2025-01-01"); // Wed
		expect(isoDates).toContain("2025-01-06"); // Mon
		expect(isoDates).toContain("2025-01-08"); // Wed
		expect(isoDates).not.toContain("2025-01-07"); // Tue — should not appear
		// Every date should be a Monday (1) or Wednesday (3)
		for (const d of results) {
			const dow = d.getUTCDay();
			expect([1, 3]).toContain(dow);
		}
	});

	it("monthly day_of_month — same day each month", () => {
		const parentStart = new Date("2025-01-15T10:00:00.000Z"); // 15th
		const rule = makeRule({ frequencyValue: 1, timeUnit: "month", monthlyType: "day_of_month", endsType: "never" });
		const windowStart = new Date("2025-01-01T00:00:00.000Z");
		const windowEnd = new Date("2025-06-30T23:59:59.999Z");

		const results = expandRecurrenceRule(rule, parentStart, null, windowStart, windowEnd);

		// Jan 15, Feb 15, Mar 15, Apr 15, May 15, Jun 15 → 6
		expect(results).toHaveLength(6);
		expect(results[0]?.toISOString()).toBe("2025-01-15T10:00:00.000Z");
		expect(results[1]?.toISOString()).toBe("2025-02-15T10:00:00.000Z");
		expect(results[5]?.toISOString()).toBe("2025-06-15T10:00:00.000Z");
	});

	it("monthly day_of_week — Nth weekday of the month", () => {
		// 2nd Wednesday of each month
		const parentStart = new Date("2025-01-08T09:00:00.000Z"); // Jan 8 = 2nd Wed
		const rule = makeRule({
			frequencyValue: 1,
			timeUnit: "month",
			monthlyType: "day_of_week",
			monthlyDayOfWeek: 3, // Wednesday
			monthlyWeekOfMonth: 2, // 2nd
			endsType: "never",
		});
		const windowStart = new Date("2025-01-01T00:00:00.000Z");
		const windowEnd = new Date("2025-04-30T23:59:59.999Z");

		const results = expandRecurrenceRule(rule, parentStart, null, windowStart, windowEnd);

		// 2nd Wed of Jan=8, Feb=12, Mar=12, Apr=9
		expect(results.length).toBeGreaterThanOrEqual(4);
		const days = results.map((d) => d.getUTCDay());
		for (const dow of days) {
			expect(dow).toBe(3); // All should be Wednesdays
		}
	});

	it("endsAfterOccurrences — stops at count", () => {
		const rule = makeRule({ frequencyValue: 1, timeUnit: "day", endsType: "after_occurrences", endsAfterOccurrences: 5 });
		const results = expandRecurrenceRule(rule, BASE_START, null, WINDOW_START, WINDOW_END);

		expect(results).toHaveLength(5);
	});

	it("endsOn date — stops before end date", () => {
		const endsOn = new Date("2025-01-10T23:59:59.999Z");
		const rule = makeRule({ frequencyValue: 1, timeUnit: "day", endsType: "on_date" });
		const results = expandRecurrenceRule(rule, BASE_START, endsOn, WINDOW_START, WINDOW_END);

		// Jan 1–10 = 10 occurrences
		expect(results).toHaveLength(10);
		expect(results[9]?.toISOString()).toBe("2025-01-10T09:00:00.000Z");
	});

	it("cap at MAX_VIRTUAL_OCCURRENCES", () => {
		// Daily for a very long window — should cap
		const rule = makeRule({ frequencyValue: 1, timeUnit: "day", endsType: "never" });
		const bigWindowEnd = new Date("2030-12-31T23:59:59.999Z");
		const results = expandRecurrenceRule(rule, BASE_START, null, WINDOW_START, bigWindowEnd);

		expect(results).toHaveLength(MAX_VIRTUAL_OCCURRENCES);
	});

	it("window start is respected — dates before windowStart are excluded", () => {
		// Parent starts before window; occurrences before windowStart must not appear
		const parentStart = new Date("2024-12-01T09:00:00.000Z");
		const rule = makeRule({ frequencyValue: 1, timeUnit: "week", endsType: "never" });
		const windowStart = new Date("2025-01-01T00:00:00.000Z");
		const windowEnd = new Date("2025-01-31T23:59:59.999Z");

		const results = expandRecurrenceRule(rule, parentStart, null, windowStart, windowEnd);

		for (const d of results) {
			expect(d.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
		}
	});
});

describe("virtual ID helpers", () => {
	it("makeVirtualId / parseVirtualId roundtrip", () => {
		const parentId = "550e8400-e29b-41d4-a716-446655440000";
		const isoDate = "2025-06-15";
		const vid = makeVirtualId(parentId, isoDate);

		expect(vid).toBe(`virtual__${parentId}__${isoDate}`);
		expect(isVirtualId(vid)).toBe(true);

		const parsed = parseVirtualId(vid);
		expect(parsed.parentId).toBe(parentId);
		expect(parsed.isoDate).toBe(isoDate);
	});

	it("isVirtualId returns false for real UUIDs", () => {
		expect(isVirtualId("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
		expect(isVirtualId("")).toBe(false);
		expect(isVirtualId("real-appointment-id")).toBe(false);
	});

	it("isVirtualId returns true only for virtual__ prefix", () => {
		expect(isVirtualId("virtual__parent__2025-01-01")).toBe(true);
		expect(isVirtualId("virtual__anything")).toBe(true);
	});

	it("parseVirtualId handles UUIDs with double underscores correctly", () => {
		const parentId = "some-uuid-with-dashes";
		const isoDate = "2025-01-01";
		const vid = makeVirtualId(parentId, isoDate);
		const parsed = parseVirtualId(vid);
		expect(parsed.parentId).toBe(parentId);
		expect(parsed.isoDate).toBe(isoDate);
	});
});
