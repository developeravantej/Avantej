/**
 * Unit tests for the pure money-math helpers in installment.service.ts.
 *
 * These underpin the installment credit-mutation cluster (adjustCredits /
 * processRefund / waive) flagged P0 in the 2026-06-01 coverage audit: the
 * refund amount and credit-unlock figures they produce all flow from these
 * three pure functions. Zero DB.
 */

import { describe, expect, it } from "bun:test";
import {
	calculateCreditsUnlocked,
	calculateInstallmentAmounts,
	calculateSuggestedRefund,
	resolveUpcomingWindow,
} from "./installment.service";

// ---------------------------------------------------------------------------
// calculateCreditsUnlocked
// ---------------------------------------------------------------------------

describe("calculateCreditsUnlocked", () => {
	it("unlocks all credits once every installment is paid", () => {
		expect(calculateCreditsUnlocked(12, 3, 3)).toBe(12);
	});

	it("unlocks all credits when paid exceeds total (defensive)", () => {
		expect(calculateCreditsUnlocked(12, 4, 3)).toBe(12);
	});

	it("unlocks zero before any installment is paid", () => {
		expect(calculateCreditsUnlocked(12, 0, 3)).toBe(0);
	});

	it("unlocks zero for a negative paid count (defensive)", () => {
		expect(calculateCreditsUnlocked(12, -1, 3)).toBe(0);
	});

	it("unlocks a proportional floor mid-schedule: 1 of 3 paid on 12 credits = 4", () => {
		expect(calculateCreditsUnlocked(12, 1, 3)).toBe(4);
	});

	it("floors a non-divisible proportion: 1 of 3 paid on 10 credits = floor(3.33) = 3", () => {
		expect(calculateCreditsUnlocked(10, 1, 3)).toBe(3);
	});

	it("floors a non-divisible proportion: 2 of 3 paid on 10 credits = floor(6.67) = 6", () => {
		expect(calculateCreditsUnlocked(10, 2, 3)).toBe(6);
	});
});

// ---------------------------------------------------------------------------
// calculateInstallmentAmounts — remainder lands on the LAST installment
// ---------------------------------------------------------------------------

describe("calculateInstallmentAmounts", () => {
	it("splits evenly when the price divides cleanly", () => {
		// RM300 (30000c) over 3 → 10000 each
		expect(calculateInstallmentAmounts(30000, 3)).toEqual([
			10000, 10000, 10000,
		]);
	});

	it("puts the rounding remainder on the final installment", () => {
		// 10000c over 3 → base floor(3333), remainder 1 → [3333, 3333, 3334]
		expect(calculateInstallmentAmounts(10000, 3)).toEqual([3333, 3333, 3334]);
	});

	it("handles a 2c-remainder on the last installment", () => {
		// 10001c over 3 → base 3333, remainder 2 → last absorbs both → 3335
		expect(calculateInstallmentAmounts(10001, 3)).toEqual([3333, 3333, 3335]);
	});

	it("returns a single-element array for one installment", () => {
		expect(calculateInstallmentAmounts(12345, 1)).toEqual([12345]);
	});

	it("always sums back to the exact total (no cents lost or created)", () => {
		for (const [total, n] of [
			[10000, 3],
			[9999, 7],
			[12345, 4],
			[100, 6],
		] as const) {
			const parts = calculateInstallmentAmounts(total, n);
			expect(parts).toHaveLength(n);
			expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
		}
	});
});

// ---------------------------------------------------------------------------
// calculateSuggestedRefund
// ---------------------------------------------------------------------------

describe("calculateSuggestedRefund", () => {
	it("returns a zero refund and explanation when the package has no credits", () => {
		const r = calculateSuggestedRefund({
			creditsTotal: 0,
			creditsUnlocked: 0,
			creditsUsed: 0,
			totalPrice: 30000,
			paidAmount: 10000,
			paidTaxAmount: 800,
		});
		expect(r.suggestedRefund).toBe(0);
		expect(r.suggestedRefundTax).toBe(0);
		expect(r.reasoning).toMatch(/no credits/i);
	});

	it("returns a zero refund when all unlocked credits were used", () => {
		const r = calculateSuggestedRefund({
			creditsTotal: 10,
			creditsUnlocked: 4,
			creditsUsed: 4,
			totalPrice: 30000,
			paidAmount: 12000,
			paidTaxAmount: 0,
		});
		expect(r.unusedCredits).toBe(0);
		expect(r.suggestedRefund).toBe(0);
		expect(r.reasoning).toMatch(/no refund value/i);
	});

	it("values unused credits at floor(totalPrice / creditsTotal) each", () => {
		// 30000 / 12 = 2500 per credit; 12 unlocked, 2 used → 10 unused × 2500 = 25000,
		// capped at paidAmount 30000 → 25000
		const r = calculateSuggestedRefund({
			creditsTotal: 12,
			creditsUnlocked: 12,
			creditsUsed: 2,
			totalPrice: 30000,
			paidAmount: 30000,
			paidTaxAmount: 0,
		});
		expect(r.pricePerCredit).toBe(2500);
		expect(r.unusedCredits).toBe(10);
		expect(r.unusedCreditValue).toBe(25000);
		expect(r.suggestedRefund).toBe(25000);
	});

	it("caps the refund at the amount actually paid (installments still owing)", () => {
		// 10 unused × 2500 = 25000 of value, but only 10000 paid so far → refund 10000
		const r = calculateSuggestedRefund({
			creditsTotal: 12,
			creditsUnlocked: 12,
			creditsUsed: 2,
			totalPrice: 30000,
			paidAmount: 10000,
			paidTaxAmount: 0,
		});
		expect(r.unusedCreditValue).toBe(25000);
		expect(r.suggestedRefund).toBe(10000);
	});

	it("apportions the paid tax proportionally to the refunded fraction", () => {
		// refund 5000 of 10000 paid (50%) → 50% of 800c tax = 400c
		const r = calculateSuggestedRefund({
			creditsTotal: 10,
			creditsUnlocked: 10,
			creditsUsed: 8,
			totalPrice: 25000, // 2500 per credit; 2 unused × 2500 = 5000
			paidAmount: 10000,
			paidTaxAmount: 800,
		});
		expect(r.suggestedRefund).toBe(5000);
		expect(r.suggestedRefundTax).toBe(400);
	});

	it("returns zero tax when nothing was paid (no divide-by-zero)", () => {
		const r = calculateSuggestedRefund({
			creditsTotal: 10,
			creditsUnlocked: 5,
			creditsUsed: 0,
			totalPrice: 25000,
			paidAmount: 0,
			paidTaxAmount: 0,
		});
		expect(r.suggestedRefund).toBe(0);
		expect(r.suggestedRefundTax).toBe(0);
	});

	it("clamps unusedCredits at zero when used exceeds unlocked (defensive)", () => {
		const r = calculateSuggestedRefund({
			creditsTotal: 10,
			creditsUnlocked: 3,
			creditsUsed: 5,
			totalPrice: 25000,
			paidAmount: 10000,
			paidTaxAmount: 0,
		});
		expect(r.unusedCredits).toBe(0);
		expect(r.suggestedRefund).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// resolveUpcomingWindow — boundary logic for the Sales → Installments tab
// ---------------------------------------------------------------------------

describe("resolveUpcomingWindow", () => {
	// Fixed reference instant so the 14-day math is deterministic.
	const now = new Date("2026-06-13T08:30:00.000Z");
	const DAY = 24 * 60 * 60 * 1000;

	it("due_soon spans [now, now+14d] inclusive on both ends", () => {
		const b = resolveUpcomingWindow("due_soon", now);
		expect(b.from?.getTime()).toBe(now.getTime());
		expect(b.fromInclusive).toBe(true);
		expect(b.to?.getTime()).toBe(now.getTime() + 14 * DAY);
		expect(b.toInclusive).toBe(true);
	});

	it("due_soon upper bound is exactly 14 days out, not 13 or 15", () => {
		const b = resolveUpcomingWindow("due_soon", now);
		const days = (b.to!.getTime() - now.getTime()) / DAY;
		expect(days).toBe(14);
	});

	it("overdue is everything strictly before now (exclusive upper, no lower)", () => {
		const b = resolveUpcomingWindow("overdue", now);
		expect(b.from).toBeNull();
		expect(b.to?.getTime()).toBe(now.getTime());
		expect(b.toInclusive).toBe(false); // lt, so an installment due exactly now is NOT overdue
	});

	it("all is unbounded — status filter alone decides membership", () => {
		const b = resolveUpcomingWindow("all", now);
		expect(b.from).toBeNull();
		expect(b.to).toBeNull();
	});

	it("does not mutate the injected now", () => {
		const snapshot = now.getTime();
		resolveUpcomingWindow("due_soon", now);
		expect(now.getTime()).toBe(snapshot);
	});
});
