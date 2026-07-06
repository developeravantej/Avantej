import { describe, test, expect } from "bun:test";
import {
	computeIncentiveBonusCents,
	monthlyPeriodKey,
} from "@avantej-core/services/commission-incentive.service";
import { previousMonthWindow } from "../../../services/incentive-sweep.service";

/**
 * UAT §12 — incentive threshold pure logic.
 */
describe("computeIncentiveBonusCents", () => {
	test("below threshold → null (no award)", () => {
		expect(
			computeIncentiveBonusCents(9_999, 10_000, "fixed", 5_000),
		).toBeNull();
	});

	test("exactly at threshold → awarded", () => {
		expect(computeIncentiveBonusCents(10_000, 10_000, "fixed", 5_000)).toBe(
			5_000,
		);
	});

	test("above threshold, fixed bonus → the fixed amount", () => {
		expect(computeIncentiveBonusCents(50_000, 10_000, "fixed", 5_000)).toBe(
			5_000,
		);
	});

	test("pct bonus → basis points of the qualifying volume, floored", () => {
		// 5% of RM 1,234.50 (123450 cents) = 6172.5 → floor 6172
		expect(computeIncentiveBonusCents(123_450, 100_000, "pct", 500)).toBe(
			6_172,
		);
	});

	test("pct below threshold → null", () => {
		expect(computeIncentiveBonusCents(50_000, 100_000, "pct", 500)).toBeNull();
	});

	test("negative bonus value is clamped to 0", () => {
		expect(computeIncentiveBonusCents(50_000, 10_000, "fixed", -100)).toBe(0);
	});
});

describe("monthlyPeriodKey", () => {
	test("formats YYYY-MM (UTC, zero-padded)", () => {
		expect(monthlyPeriodKey(new Date("2026-06-24T10:00:00Z"))).toBe("2026-06");
		expect(monthlyPeriodKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
		expect(monthlyPeriodKey(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
	});
});

describe("previousMonthWindow", () => {
	test("mid-month → the full previous calendar month", () => {
		const { periodStart, periodEnd, periodKey } = previousMonthWindow(
			new Date("2026-06-15T12:00:00Z"),
		);
		expect(periodKey).toBe("2026-05");
		expect(periodStart.toISOString()).toBe("2026-05-01T00:00:00.000Z");
		expect(periodEnd.toISOString()).toBe("2026-05-31T23:59:59.999Z");
	});

	test("January → rolls back to previous December", () => {
		const { periodStart, periodEnd, periodKey } = previousMonthWindow(
			new Date("2026-01-10T00:00:00Z"),
		);
		expect(periodKey).toBe("2025-12");
		expect(periodStart.toISOString()).toBe("2025-12-01T00:00:00.000Z");
		expect(periodEnd.toISOString()).toBe("2025-12-31T23:59:59.999Z");
	});
});
