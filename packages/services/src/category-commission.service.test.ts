/**
 * Category Commission Service — Unit Tests.
 *
 * Per-category commission config. The validation that runs BEFORE the DB
 * transaction is the correctness layer: slot weightages must sum to 100%, and
 * conditional tiers must not cover overlapping attendee-count ranges (an
 * overlap makes commission ambiguous for that headcount). This pins:
 *
 *   - toHalfOpen: operator + threshold → half-open [start, end) interval
 *   - intervalsOverlap: boundary-correct overlap detection
 *   - upsertCategoryCommissionConfig validation guards, verified to reject
 *     BEFORE opening a transaction (stub throws if the tx is reached).
 *
 * Run: bun test src/category-commission.service.test.ts
 */

import { describe, expect, it } from "bun:test";
import {
	intervalsOverlap,
	toHalfOpen,
	upsertCategoryCommissionConfig,
	type UpsertCategoryCommissionConfigInput,
} from "./category-commission.service";

// ---------------------------------------------------------------------------
// toHalfOpen — operator → [start, end)
// ---------------------------------------------------------------------------

describe("toHalfOpen", () => {
	it("lt threshold → [0, threshold)", () => {
		expect(toHalfOpen("lt", 5)).toEqual([0, 5]);
	});
	it("lte threshold → [0, threshold + 1)", () => {
		expect(toHalfOpen("lte", 5)).toEqual([0, 6]);
	});
	it("gt threshold → [threshold + 1, +inf)", () => {
		expect(toHalfOpen("gt", 5)).toEqual([6, Number.POSITIVE_INFINITY]);
	});
	it("gte threshold → [threshold, +inf)", () => {
		expect(toHalfOpen("gte", 5)).toEqual([5, Number.POSITIVE_INFINITY]);
	});
	it("eq threshold → [threshold, threshold + 1) (single value)", () => {
		expect(toHalfOpen("eq", 5)).toEqual([5, 6]);
	});
	it("between threshold..thresholdMax → [threshold, thresholdMax + 1)", () => {
		expect(toHalfOpen("between", 3, 7)).toEqual([3, 8]);
	});
	it("between with no thresholdMax collapses to a single value", () => {
		expect(toHalfOpen("between", 4)).toEqual([4, 5]);
	});
	it("unknown operator falls back to a single-value interval", () => {
		expect(toHalfOpen("???", 9)).toEqual([9, 10]);
	});
});

// ---------------------------------------------------------------------------
// intervalsOverlap — boundary correctness
// ---------------------------------------------------------------------------

describe("intervalsOverlap", () => {
	it("detects a genuine overlap", () => {
		expect(intervalsOverlap([0, 5], [4, 6])).toBe(true);
	});

	it("treats touching half-open intervals as NOT overlapping (lt 5 vs gte 5)", () => {
		// [0,5) and [5,∞): attendee 5 belongs only to the second — adjacent, fine.
		expect(intervalsOverlap(toHalfOpen("lt", 5), toHalfOpen("gte", 5))).toBe(
			false,
		);
	});

	it("treats lte 5 vs gt 5 as adjacent, not overlapping", () => {
		// [0,6) and [6,∞)
		expect(intervalsOverlap(toHalfOpen("lte", 5), toHalfOpen("gt", 5))).toBe(
			false,
		);
	});

	it("flags eq overlapping a range that contains it (eq 4 vs lt 5)", () => {
		// [4,5) ⊂ [0,5)
		expect(intervalsOverlap(toHalfOpen("eq", 4), toHalfOpen("lt", 5))).toBe(
			true,
		);
	});

	it("two identical eq conditions overlap", () => {
		expect(intervalsOverlap(toHalfOpen("eq", 5), toHalfOpen("eq", 5))).toBe(
			true,
		);
	});

	it("disjoint eq values do not overlap", () => {
		expect(intervalsOverlap(toHalfOpen("eq", 3), toHalfOpen("eq", 5))).toBe(
			false,
		);
	});
});

// ---------------------------------------------------------------------------
// upsertCategoryCommissionConfig — validation guards (reject before any tx)
// ---------------------------------------------------------------------------

/** TenantDb whose transaction throws a marker, so we can tell "validation
 *  passed → reached DB" apart from "validation rejected". */
const REACHED_TX = "REACHED_TX";
const dbThatMarksTx = {
	transaction: () => {
		throw new Error(REACHED_TX);
	},
} as unknown as never;

const ACTOR = { userId: "admin-1", role: "admin" };

function baseInput(
	over: Partial<UpsertCategoryCommissionConfigInput> = {},
): UpsertCategoryCommissionConfigInput {
	return {
		categoryId: "cat-1",
		paymentType: "fixed",
		isConditional: false,
		maxCoaches: 1,
		slots: [{ slotIndex: 0, label: "Lead", weightageBasisPoints: 10000 }],
		rates: [{ trainerTierId: "tier-1", amount: 5000 }],
		...over,
	};
}

describe("upsertCategoryCommissionConfig — validation", () => {
	it("rejects slot weightages that do not sum to 10000", async () => {
		await expect(
			upsertCategoryCommissionConfig(
				dbThatMarksTx,
				baseInput({
					slots: [
						{ slotIndex: 0, label: "A", weightageBasisPoints: 6000 },
						{ slotIndex: 1, label: "B", weightageBasisPoints: 3000 },
					],
				}),
				ACTOR,
			),
		).rejects.toThrow(/sum to 10000/);
	});

	it("rejects a non-conditional config with no rates", async () => {
		await expect(
			upsertCategoryCommissionConfig(
				dbThatMarksTx,
				baseInput({ isConditional: false, rates: [] }),
				ACTOR,
			),
		).rejects.toThrow(/requires rates/);
	});

	it("rejects a conditional config with no conditions", async () => {
		await expect(
			upsertCategoryCommissionConfig(
				dbThatMarksTx,
				baseInput({ isConditional: true, conditions: [] }),
				ACTOR,
			),
		).rejects.toThrow(/at least one condition/);
	});

	it("rejects conditional config whose conditions overlap", async () => {
		await expect(
			upsertCategoryCommissionConfig(
				dbThatMarksTx,
				baseInput({
					isConditional: true,
					conditions: [
						{
							conditionIndex: 0,
							operator: "lte",
							threshold: 5,
							label: "small",
							rates: [{ trainerTierId: "t1", amount: 100 }],
						},
						{
							conditionIndex: 1,
							operator: "gte",
							threshold: 5, // [5,∞) overlaps [0,6)
							label: "big",
							rates: [{ trainerTierId: "t1", amount: 200 }],
						},
					],
				}),
				ACTOR,
			),
		).rejects.toThrow(/overlap/);
	});

	it("passes validation (reaching the DB tx) for adjacent, non-overlapping conditions", async () => {
		await expect(
			upsertCategoryCommissionConfig(
				dbThatMarksTx,
				baseInput({
					isConditional: true,
					rates: undefined,
					conditions: [
						{
							conditionIndex: 0,
							operator: "lt",
							threshold: 5, // [0,5)
							rates: [{ trainerTierId: "t1", amount: 100 }],
						},
						{
							conditionIndex: 1,
							operator: "gte",
							threshold: 5, // [5,∞) — adjacent, no overlap
							rates: [{ trainerTierId: "t1", amount: 200 }],
						},
					],
				}),
				ACTOR,
			),
		).rejects.toThrow(REACHED_TX);
	});

	it("passes validation for a well-formed non-conditional config (reaches tx)", async () => {
		await expect(
			upsertCategoryCommissionConfig(dbThatMarksTx, baseInput(), ACTOR),
		).rejects.toThrow(REACHED_TX);
	});
});
