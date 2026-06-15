/**
 * Unit tests for money-math.ts — the pure discount / tax / premium arithmetic
 * that feeds every monetary total. Zero DB. Covers P0 "money totals" gaps for
 * the promotions + tax clusters (2026-06-01 coverage audit).
 */

import { describe, expect, it } from "bun:test";
import {
	applyInstallmentPremium,
	applyTaxBasisPoints,
	calculatePromoDiscount,
} from "./money-math";

// ---------------------------------------------------------------------------
// calculatePromoDiscount — percentage
// ---------------------------------------------------------------------------

describe("calculatePromoDiscount — percentage", () => {
	it("applies a whole-percent rate: 20% of RM100 (10000c) = RM20 (2000c)", () => {
		expect(
			calculatePromoDiscount({
				type: "percentage",
				value: 2000,
				orderAmount: 10000,
			}),
		).toBe(2000);
	});

	it("supports fractional basis points: 8.5% (850bp) of 10000c = 850c", () => {
		expect(
			calculatePromoDiscount({
				type: "percentage",
				value: 850,
				orderAmount: 10000,
			}),
		).toBe(850);
	});

	it("floors sub-cent results (never over-discounts): 33.33% of 7c = floor(2.333) = 2c", () => {
		// 7 * 3333 / 10000 = 2.3331 → floor → 2
		expect(
			calculatePromoDiscount({
				type: "percentage",
				value: 3333,
				orderAmount: 7,
			}),
		).toBe(2);
	});

	it("caps at maximumDiscount when the percentage exceeds the cap", () => {
		// 50% of 10000c = 5000c, capped at 3000c
		expect(
			calculatePromoDiscount({
				type: "percentage",
				value: 5000,
				orderAmount: 10000,
				maximumDiscount: 3000,
			}),
		).toBe(3000);
	});

	it("does NOT cap when the computed discount is below maximumDiscount", () => {
		// 10% of 10000c = 1000c, cap 3000c → uncapped 1000c
		expect(
			calculatePromoDiscount({
				type: "percentage",
				value: 1000,
				orderAmount: 10000,
				maximumDiscount: 3000,
			}),
		).toBe(1000);
	});

	it("treats a null maximumDiscount as uncapped", () => {
		expect(
			calculatePromoDiscount({
				type: "percentage",
				value: 5000,
				orderAmount: 10000,
				maximumDiscount: null,
			}),
		).toBe(5000);
	});

	it("returns 0 for a 0% promotion", () => {
		expect(
			calculatePromoDiscount({
				type: "percentage",
				value: 0,
				orderAmount: 10000,
			}),
		).toBe(0);
	});

	it("returns 0 on a zero-amount order", () => {
		expect(
			calculatePromoDiscount({
				type: "percentage",
				value: 2000,
				orderAmount: 0,
			}),
		).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// calculatePromoDiscount — fixed_amount
// ---------------------------------------------------------------------------

describe("calculatePromoDiscount — fixed_amount", () => {
	it("discounts the flat value when it is below the order amount", () => {
		expect(
			calculatePromoDiscount({
				type: "fixed_amount",
				value: 1000,
				orderAmount: 10000,
			}),
		).toBe(1000);
	});

	it("clamps to the order amount so the total never goes negative", () => {
		// RM50 off on an RM30 order → only RM30 off
		expect(
			calculatePromoDiscount({
				type: "fixed_amount",
				value: 5000,
				orderAmount: 3000,
			}),
		).toBe(3000);
	});

	it("equals the order amount exactly when value == orderAmount", () => {
		expect(
			calculatePromoDiscount({
				type: "fixed_amount",
				value: 3000,
				orderAmount: 3000,
			}),
		).toBe(3000);
	});
});

// ---------------------------------------------------------------------------
// calculatePromoDiscount — free_item / buy_x_get_y
// ---------------------------------------------------------------------------

describe("calculatePromoDiscount — item-value types", () => {
	it("free_item returns the configured item value verbatim", () => {
		expect(
			calculatePromoDiscount({
				type: "free_item",
				value: 1500,
				orderAmount: 10000,
			}),
		).toBe(1500);
	});

	it("buy_x_get_y returns the configured value verbatim", () => {
		expect(
			calculatePromoDiscount({
				type: "buy_x_get_y",
				value: 800,
				orderAmount: 10000,
			}),
		).toBe(800);
	});
});

// ---------------------------------------------------------------------------
// applyTaxBasisPoints
// ---------------------------------------------------------------------------

describe("applyTaxBasisPoints", () => {
	it("applies SST 8% (800bp) to RM100 base = RM8 (800c)", () => {
		expect(applyTaxBasisPoints(10000, 800)).toBe(800);
	});

	it("applies 6% (600bp) to 5000c = 300c", () => {
		expect(applyTaxBasisPoints(5000, 600)).toBe(300);
	});

	it("floors sub-cent tax: 8% of 3c = floor(0.24) = 0", () => {
		expect(applyTaxBasisPoints(3, 800)).toBe(0);
	});

	it("floors sub-cent tax: 8% of 13c = floor(1.04) = 1", () => {
		expect(applyTaxBasisPoints(13, 800)).toBe(1);
	});

	it("returns 0 for a null rate", () => {
		expect(applyTaxBasisPoints(10000, null)).toBe(0);
	});

	it("returns 0 for an undefined rate", () => {
		expect(applyTaxBasisPoints(10000, undefined)).toBe(0);
	});

	it("returns 0 for a 0bp rate", () => {
		expect(applyTaxBasisPoints(10000, 0)).toBe(0);
	});

	it("returns 0 when the tax base is 0", () => {
		expect(applyTaxBasisPoints(0, 800)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// applyInstallmentPremium
// ---------------------------------------------------------------------------

describe("applyInstallmentPremium", () => {
	it("adds a 5% (500bp) premium to RM300 (30000c) = RM315 (31500c)", () => {
		expect(applyInstallmentPremium(30000, 500)).toBe(31500);
	});

	it("returns the base unchanged for a 0bp premium", () => {
		expect(applyInstallmentPremium(30000, 0)).toBe(30000);
	});

	it("returns the base unchanged for a null premium", () => {
		expect(applyInstallmentPremium(30000, null)).toBe(30000);
	});

	it("rounds to the nearest cent: 30001c × 1.05 = 31501.05 → 31501", () => {
		expect(applyInstallmentPremium(30001, 500)).toBe(31501);
	});

	it("rounds half up: 10c × 1.025 (250bp) = 10.25 → 10", () => {
		// 10 * 10250 / 10000 = 10.25 → round → 10
		expect(applyInstallmentPremium(10, 250)).toBe(10);
	});
});
