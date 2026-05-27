/**
 * Unit tests for commission-cycle.service — pure bounds derivation.
 *
 * Pure functions only — no DB required. Verifies the math of `deriveCycleBounds`
 * across all four cycle types and the tricky boundary cases that motivated the
 * fix (S-cycle-window-alignment).
 */
import { describe, expect, it } from "bun:test";
import {
	deriveCycleBounds,
	DEFAULT_POLICY,
	type CyclePolicy,
} from "./commission-cycle.service";

describe("deriveCycleBounds — calendar_month (default fallback)", () => {
	it("matches UTC calendar-month bounds (1st → 1st of next month)", () => {
		const earnedAt = new Date(Date.UTC(2026, 4, 15, 12, 0, 0)); // May 15
		const { start, end } = deriveCycleBounds(DEFAULT_POLICY, earnedAt);
		expect(start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
		expect(end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
	});

	it("wraps year boundary correctly (December → January)", () => {
		const earnedAt = new Date(Date.UTC(2026, 11, 31, 23, 0, 0));
		const { start, end } = deriveCycleBounds(DEFAULT_POLICY, earnedAt);
		expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
		expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
	});
});

describe("deriveCycleBounds — monthly_anchored", () => {
	const policy: CyclePolicy = { cycleType: "monthly_anchored", anchorDay: 22 };

	it("after-anchor: cycle starts in the current month", () => {
		const earnedAt = new Date(Date.UTC(2026, 4, 24)); // May 24
		const { start, end } = deriveCycleBounds(policy, earnedAt);
		expect(start.toISOString()).toBe("2026-05-22T00:00:00.000Z");
		expect(end.toISOString()).toBe("2026-06-22T00:00:00.000Z");
	});

	it("before-anchor: cycle started in the previous month", () => {
		const earnedAt = new Date(Date.UTC(2026, 4, 21)); // May 21 (< 22)
		const { start, end } = deriveCycleBounds(policy, earnedAt);
		expect(start.toISOString()).toBe("2026-04-22T00:00:00.000Z");
		expect(end.toISOString()).toBe("2026-05-22T00:00:00.000Z");
	});

	it("exactly on the anchor day at 00:00:00 → starts this cycle", () => {
		const earnedAt = new Date(Date.UTC(2026, 4, 22, 0, 0, 0)); // May 22 sharp
		const { start } = deriveCycleBounds(policy, earnedAt);
		expect(start.toISOString()).toBe("2026-05-22T00:00:00.000Z");
	});

	it("crosses year boundary when anchor cycle straddles December", () => {
		const policyDec: CyclePolicy = { cycleType: "monthly_anchored", anchorDay: 22 };
		const earnedAt = new Date(Date.UTC(2027, 0, 10)); // Jan 10 2027 → cycle from Dec 22 2026
		const { start, end } = deriveCycleBounds(policyDec, earnedAt);
		expect(start.toISOString()).toBe("2026-12-22T00:00:00.000Z");
		expect(end.toISOString()).toBe("2027-01-22T00:00:00.000Z");
	});

	it("REGRESSION (S-cycle-window-alignment): May 21st split is NOT in May calendar window", () => {
		// The pre-fix bug: trainer earning on May 21 was capped against splits in
		// May 1–31 (calendar month). With anchorDay=22, the correct window is
		// April 22–May 22. The two windows differ.
		const earnedAt = new Date(Date.UTC(2026, 4, 21));
		const anchored = deriveCycleBounds(policy, earnedAt);
		const calendar = deriveCycleBounds(DEFAULT_POLICY, earnedAt);
		expect(anchored.start.toISOString()).not.toBe(calendar.start.toISOString());
		expect(anchored.end.toISOString()).not.toBe(calendar.end.toISOString());
	});
});

describe("deriveCycleBounds — semi_monthly", () => {
	const policy: CyclePolicy = { cycleType: "semi_monthly", anchorDay: 1 };
	// First half: 1–15, second half: 16–end (anchor=1 → 16 = 1+15)

	it("first half: 1st-of-month to 16th-of-month", () => {
		const earnedAt = new Date(Date.UTC(2026, 4, 5));
		const { start, end } = deriveCycleBounds(policy, earnedAt);
		expect(start.toISOString()).toBe("2026-05-01T00:00:00.000Z");
		expect(end.toISOString()).toBe("2026-05-16T00:00:00.000Z");
	});

	it("second half: 16th to next month's 1st", () => {
		const earnedAt = new Date(Date.UTC(2026, 4, 20));
		const { start, end } = deriveCycleBounds(policy, earnedAt);
		expect(start.toISOString()).toBe("2026-05-16T00:00:00.000Z");
		expect(end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
	});
});

describe("deriveCycleBounds — weekly", () => {
	const policy: CyclePolicy = { cycleType: "weekly", anchorDay: 1 }; // Monday

	it("starts on the most-recent Monday at 00:00 UTC and spans 7 days", () => {
		// Tue 2026-05-26 → most recent Monday is 2026-05-25
		const earnedAt = new Date(Date.UTC(2026, 4, 26, 14, 30, 0));
		const { start, end } = deriveCycleBounds(policy, earnedAt);
		expect(start.toISOString()).toBe("2026-05-25T00:00:00.000Z");
		expect(end.toISOString()).toBe("2026-06-01T00:00:00.000Z");
	});

	it("earnedAt exactly on the anchor weekday returns same-day midnight", () => {
		// Mon 2026-05-25 14:00 → start should be 2026-05-25 00:00
		const earnedAt = new Date(Date.UTC(2026, 4, 25, 14, 0, 0));
		const { start } = deriveCycleBounds(policy, earnedAt);
		expect(start.toISOString()).toBe("2026-05-25T00:00:00.000Z");
	});
});
