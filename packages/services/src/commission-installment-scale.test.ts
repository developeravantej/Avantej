/**
 * Conservation unit tests for scaleInstallmentCommission (Phase D)
 *
 * MANDATORY: proves that distributing a planned origination commission
 * proportionally across N installments always sums back to the full planned
 * amount, regardless of rounding.
 *
 * The helper is pure and has no DB dependency — tests run entirely in memory.
 */

import { describe, it, expect } from "bun:test";
import { scaleInstallmentCommission } from "./commission-calculator.service";

// ---------------------------------------------------------------------------
// Helper: simulate the full distribution across N installments
// ---------------------------------------------------------------------------

/**
 * Simulate the Phase D distribution for `n` installments where all dues are
 * equal (each = `installmentDue`). Returns the array of per-installment amounts
 * and asserts conservation.
 */
function distributeEvenly(
	plannedTotal: number,
	installmentDue: number,
	orderTotal: number,
	n: number,
): number[] {
	const results: number[] = [];
	let accumulated = 0;

	for (let i = 1; i <= n; i++) {
		const isLast = i === n;
		const amount = scaleInstallmentCommission(
			plannedTotal,
			installmentDue,
			orderTotal,
			isLast,
			accumulated,
		);
		results.push(amount);
		accumulated += amount;
	}

	return results;
}

/**
 * Simulate the Phase D distribution for N installments where each has a
 * specific due amount (non-uniform). Returns the array of per-installment amounts.
 */
function distributeNonUniform(
	plannedTotal: number,
	dues: number[],
	orderTotal: number,
): number[] {
	const results: number[] = [];
	let accumulated = 0;

	for (let i = 0; i < dues.length; i++) {
		const isLast = i === dues.length - 1;
		const amount = scaleInstallmentCommission(
			plannedTotal,
			dues[i]!,
			orderTotal,
			isLast,
			accumulated,
		);
		results.push(amount);
		accumulated += amount;
	}

	return results;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe("scaleInstallmentCommission — conservation property", () => {
	it("divides 30000 cents exactly across 3 equal installments of 10000 each", () => {
		// Planned total = 30000 (e.g. 10% on a RM300 order)
		// 3 installments, each RM100 + tax = 10000 cents
		// orderTotal = 30000
		const amounts = distributeEvenly(30_000, 10_000, 30_000, 3);

		// Each of installments 1 & 2: floor(30000 × 10000 / 30000) = 10000
		// Last installment (true-up): 30000 - 20000 = 10000
		expect(amounts).toHaveLength(3);
		expect(amounts[0]).toBe(10_000); // floor(30000 × 10000 / 30000)
		expect(amounts[1]).toBe(10_000); // floor(30000 × 10000 / 30000)
		expect(amounts[2]).toBe(10_000); // true-up: 30000 - 20000

		const total = amounts.reduce((s, a) => s + a, 0);
		expect(total).toBe(30_000); // Conservation: sum == planned
	});

	it("handles non-divisible amount: 10000 across [3334, 3333, 3333]", () => {
		// Planned total = 10000 (e.g. 10% on RM100 order)
		// 3 installments with dues [3334, 3333, 3333] (orderTotal = 10000)
		const dues = [3_334, 3_333, 3_333];
		const orderTotal = dues.reduce((s, d) => s + d, 0); // 10000
		const amounts = distributeNonUniform(10_000, dues, orderTotal);

		// Installment 1: floor(10000 × 3334 / 10000) = floor(3334) = 3334
		// Installment 2: floor(10000 × 3333 / 10000) = floor(3333) = 3333
		// Installment 3 (true-up): 10000 - 3334 - 3333 = 3333
		expect(amounts[0]).toBe(3_334);
		expect(amounts[1]).toBe(3_333);
		expect(amounts[2]).toBe(3_333);

		const total = amounts.reduce((s, a) => s + a, 0);
		expect(total).toBe(10_000); // Conservation
	});

	it("handles rounding remainder that accumulates: 10000 across 3 equal parts of 3333 each", () => {
		// dues [3333, 3333, 3334] — a real schedule where last absorbs remainder
		// orderTotal = 9999 + 1 rounding... or let's say orderTotal = 10000 with
		// two 3333 and one 3334 installment.
		const dues = [3_333, 3_333, 3_334];
		const orderTotal = 10_000;
		const amounts = distributeNonUniform(10_000, dues, orderTotal);

		// Installment 1: floor(10000 × 3333 / 10000) = 3333
		// Installment 2: floor(10000 × 3333 / 10000) = 3333
		// Installment 3 (true-up): 10000 - 3333 - 3333 = 3334
		expect(amounts[0]).toBe(3_333);
		expect(amounts[1]).toBe(3_333);
		expect(amounts[2]).toBe(3_334);

		const total = amounts.reduce((s, a) => s + a, 0);
		expect(total).toBe(10_000); // Conservation
	});

	it("handles a heavily non-divisible case: 1 cent commission across 3 installments", () => {
		// Planned = 1 cent, 3 equal installments of 100 each, orderTotal = 300
		// Installments 1&2: floor(1 × 100 / 300) = floor(0.333) = 0
		// Installment 3 (true-up): 1 - 0 - 0 = 1
		const amounts = distributeEvenly(1, 100, 300, 3);

		expect(amounts[0]).toBe(0);
		expect(amounts[1]).toBe(0);
		expect(amounts[2]).toBe(1);

		const total = amounts.reduce((s, a) => s + a, 0);
		expect(total).toBe(1); // Conservation even when intermediates are 0
	});

	it("handles 2-installment plan: 15000 across [7500, 7500]", () => {
		const amounts = distributeEvenly(15_000, 7_500, 15_000, 2);

		expect(amounts[0]).toBe(7_500); // floor(15000 × 7500 / 15000)
		expect(amounts[1]).toBe(7_500); // true-up: 15000 - 7500

		const total = amounts.reduce((s, a) => s + a, 0);
		expect(total).toBe(15_000);
	});

	it("handles 6-installment plan with uneven split: 10000 across 6 × 1667 (total 10002)", () => {
		// orderTotal != n × installmentDue to verify rounding robustness
		// dues: [1667, 1667, 1667, 1667, 1667, 1667] — intentionally 2 cents over
		// true-up should clamp correctly via max(0, ...)
		const dues = Array(6).fill(1_667) as number[];
		const orderTotal = dues.reduce((s, d) => s + d, 0); // 10002
		const amounts = distributeNonUniform(10_000, dues, orderTotal);

		// Each of installments 1-5: floor(10000 × 1667 / 10002) = floor(1666.67) = 1666
		// Installment 6 (true-up): 10000 - 5 × 1666 = 10000 - 8330 = 1670
		for (let i = 0; i < 5; i++) {
			expect(amounts[i]).toBe(Math.floor((10_000 * 1_667) / 10_002));
		}

		const total = amounts.reduce((s, a) => s + a, 0);
		expect(total).toBe(10_000); // Conservation holds
	});

	it("clamps to 0 when alreadyAttributed exceeds plannedTotal (over-payment guard)", () => {
		// Edge case: somehow prior rows already exceed the plan (should not happen,
		// but the guard ensures we never create a negative commission row)
		const result = scaleInstallmentCommission(
			1_000, // plannedTotal
			500, // installmentDue
			1_500, // orderTotal
			true, // isLast
			2_000, // alreadyAttributed > plannedTotal
		);
		expect(result).toBe(0); // clamped to 0, never negative
	});

	it("single installment (n=1): all commission on the sole installment", () => {
		// This is the edge where installmentsTotal=1 — should not normally reach
		// Phase D (single plans are front-loaded), but function must be correct.
		const amounts = distributeEvenly(5_000, 5_000, 5_000, 1);

		expect(amounts[0]).toBe(5_000); // isLast=true, alreadyAttributed=0

		const total = amounts.reduce((s, a) => s + a, 0);
		expect(total).toBe(5_000);
	});
});
