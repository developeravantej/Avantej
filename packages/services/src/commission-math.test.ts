/**
 * Unit tests for commission-math.ts pure helpers.
 *
 * Audit references mirror the source module:
 *   #1 — multiply-then-floor
 *   #2 — config-sum 10000 bp invariant
 *   #3 — dedupe by slotIndex
 */

import { describe, expect, it } from "bun:test";
import {
	assertConfigSumIs10000,
	computeEffectiveWeightages,
	computeFinalAmountCents,
	dedupeBySlotIndex,
	type SlotConfig,
	type StaffAssignment,
} from "./commission-math";

// ---------------------------------------------------------------------------
// assertConfigSumIs10000 (#2)
// ---------------------------------------------------------------------------

describe("assertConfigSumIs10000", () => {
	it("does not throw for an empty slots array", () => {
		expect(() => assertConfigSumIs10000([], "cfg-1")).not.toThrow();
	});

	it("does not throw when slots sum to exactly 10000bp", () => {
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 6000 },
			{ slotIndex: 1, weightageBasisPoints: 4000 },
		];
		expect(() => assertConfigSumIs10000(slots, "cfg-2")).not.toThrow();
	});

	it("throws with configId in message when slots sum to 9999bp", () => {
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 5000 },
			{ slotIndex: 1, weightageBasisPoints: 4999 },
		];
		expect(() => assertConfigSumIs10000(slots, "config-xyz")).toThrow(
			/config-xyz/,
		);
	});

	it("throws when slots sum to 9999bp (off-by-one low)", () => {
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 5000 },
			{ slotIndex: 1, weightageBasisPoints: 4999 },
		];
		expect(() => assertConfigSumIs10000(slots, "cfg-3")).toThrow(
			/sum to 9999bp; expected 10000bp/,
		);
	});

	it("throws when slots sum to 10001bp (off-by-one high)", () => {
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 5001 },
			{ slotIndex: 1, weightageBasisPoints: 5000 },
		];
		expect(() => assertConfigSumIs10000(slots, "cfg-4")).toThrow(
			/sum to 10001bp; expected 10000bp/,
		);
	});

	it("does not throw for a single slot at 10000bp", () => {
		const slots: SlotConfig[] = [{ slotIndex: 0, weightageBasisPoints: 10000 }];
		expect(() => assertConfigSumIs10000(slots, "cfg-5")).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// dedupeBySlotIndex (#3)
// ---------------------------------------------------------------------------

describe("dedupeBySlotIndex", () => {
	it("returns empty array and no duplicates for empty input", () => {
		const result = dedupeBySlotIndex([]);
		expect(result).toEqual({ deduped: [], hadDuplicates: false });
	});

	it("returns the same items with hadDuplicates=false when no duplicates exist", () => {
		const assignments: StaffAssignment[] = [
			{ staffId: "s1", slotIndex: 0 },
			{ staffId: "s2", slotIndex: 1 },
		];
		const { deduped, hadDuplicates } = dedupeBySlotIndex(assignments);
		expect(hadDuplicates).toBe(false);
		expect(deduped).toHaveLength(2);
	});

	it("sets hadDuplicates=true and keeps last-write-wins when one slotIndex is duplicated", () => {
		const assignments: StaffAssignment[] = [
			{ staffId: "s1", slotIndex: 0 },
			{ staffId: "s2", slotIndex: 0 }, // duplicate — should win
			{ staffId: "s3", slotIndex: 1 },
		];
		const { deduped, hadDuplicates } = dedupeBySlotIndex(assignments);
		expect(hadDuplicates).toBe(true);
		expect(deduped).toHaveLength(2);
		// Map.set overwrites; last writer for slotIndex=0 is s2
		const slot0 = deduped.find((a) => a.slotIndex === 0);
		expect(slot0?.staffId).toBe("s2");
	});

	it("collapses all-same slotIndex to a single item", () => {
		const assignments: StaffAssignment[] = [
			{ staffId: "s1", slotIndex: 5 },
			{ staffId: "s2", slotIndex: 5 },
			{ staffId: "s3", slotIndex: 5 },
		];
		const { deduped, hadDuplicates } = dedupeBySlotIndex(assignments);
		expect(hadDuplicates).toBe(true);
		expect(deduped).toHaveLength(1);
		// Last writer wins
		expect(deduped[0].staffId).toBe("s3");
	});
});

// ---------------------------------------------------------------------------
// computeEffectiveWeightages
// ---------------------------------------------------------------------------

describe("computeEffectiveWeightages", () => {
	it("returns empty array when no valid assignments provided", () => {
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 5000 },
			{ slotIndex: 1, weightageBasisPoints: 5000 },
		];
		expect(computeEffectiveWeightages(slots, [])).toEqual([]);
	});

	it("returns each slot's own weightage when all slots are assigned (2 slots, 5000bp each)", () => {
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 5000 },
			{ slotIndex: 1, weightageBasisPoints: 5000 },
		];
		const assignments: StaffAssignment[] = [
			{ staffId: "s1", slotIndex: 0 },
			{ staffId: "s2", slotIndex: 1 },
		];
		const result = computeEffectiveWeightages(slots, assignments);
		expect(result).toEqual([5000, 5000]);
	});

	it("absorbs absent slot weightage into the single present coach (slot 1 absent, slot 0 present)", () => {
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 5000 },
			{ slotIndex: 1, weightageBasisPoints: 5000 },
		];
		const assignments: StaffAssignment[] = [{ staffId: "s1", slotIndex: 0 }];
		const result = computeEffectiveWeightages(slots, assignments);
		// slot 0 gets its 5000 + redistributed 5000 from absent slot 1
		expect(result).toEqual([10000]);
	});

	it("distributes absent slot evenly across 2 present coaches (3 slots, one absent)", () => {
		// 3 slots: 4000 + 3000 + 3000 = 10000; slot 2 (3000bp) absent
		// bonus = floor(3000/2) = 1500; remainder = 3000 - 1500*2 = 0
		// slot 0 = 4000+1500 = 5500; slot 1 = 3000+1500 = 4500
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 4000 },
			{ slotIndex: 1, weightageBasisPoints: 3000 },
			{ slotIndex: 2, weightageBasisPoints: 3000 },
		];
		const assignments: StaffAssignment[] = [
			{ staffId: "s1", slotIndex: 0 },
			{ staffId: "s2", slotIndex: 1 },
		];
		const result = computeEffectiveWeightages(slots, assignments);
		expect(result).toEqual([5500, 4500]);
		// Sanity: must still sum to 10000
		expect(result.reduce((a, b) => a + b, 0)).toBe(10000);
	});

	it("assigns all 10000bp to the single present coach when the other two are absent", () => {
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 5000 },
			{ slotIndex: 1, weightageBasisPoints: 3000 },
			{ slotIndex: 2, weightageBasisPoints: 2000 },
		];
		const assignments: StaffAssignment[] = [{ staffId: "s1", slotIndex: 0 }];
		const result = computeEffectiveWeightages(slots, assignments);
		expect(result).toEqual([10000]);
	});

	it("handles 3 slots with exact even redistribution (4000+3000+3000, one absent slot with 3000)", () => {
		// Same as previous "distribute evenly" test — explicit remainder=0 check
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 4000 },
			{ slotIndex: 1, weightageBasisPoints: 3000 },
			{ slotIndex: 2, weightageBasisPoints: 3000 },
		];
		const assignments: StaffAssignment[] = [
			{ staffId: "s1", slotIndex: 0 },
			{ staffId: "s2", slotIndex: 1 },
		];
		const result = computeEffectiveWeightages(slots, assignments);
		// 3000 % 2 === 0 → no extra basis point distributed
		expect(result[0]).toBe(5500);
		expect(result[1]).toBe(4500);
		expect(result.reduce((a, b) => a + b, 0)).toBe(10000);
	});

	it("distributes remainder=1 correctly: first present coach gets the extra bp", () => {
		// 3 slots: 3334 + 3333 + 3333 = 10000; slot 2 (3333bp) absent
		// bonus = floor(3333/2) = 1666; remainder = 3333 - 1666*2 = 1
		// slot 0 (i=0, 0<1) gets +1: 3334+1666+1 = 5001
		// slot 1 (i=1, 1≥1) gets +0: 3333+1666+0 = 4999
		// total = 5001+4999 = 10000 ✓
		const slots: SlotConfig[] = [
			{ slotIndex: 0, weightageBasisPoints: 3334 },
			{ slotIndex: 1, weightageBasisPoints: 3333 },
			{ slotIndex: 2, weightageBasisPoints: 3333 },
		];
		const assignments: StaffAssignment[] = [
			{ staffId: "s1", slotIndex: 0 },
			{ staffId: "s2", slotIndex: 1 },
		];
		const result = computeEffectiveWeightages(slots, assignments);
		expect(result[0]).toBe(5001);
		expect(result[1]).toBe(4999);
		expect(result.reduce((a, b) => a + b, 0)).toBe(10000);
	});
});

// ---------------------------------------------------------------------------
// computeFinalAmountCents (#1)
// ---------------------------------------------------------------------------

describe("computeFinalAmountCents", () => {
	it("returns 0 when quantity is 0", () => {
		expect(computeFinalAmountCents(1000, 5000, 0)).toBe(0);
	});

	it("returns 0 when quantity is negative", () => {
		expect(computeFinalAmountCents(1000, 5000, -1)).toBe(0);
	});

	it("returns the full baseAmount when weightage is 10000bp (100%), quantity=1", () => {
		expect(computeFinalAmountCents(1000, 10000, 1)).toBe(1000);
	});

	it("returns half baseAmount when weightage is 5000bp (50%), quantity=1", () => {
		expect(computeFinalAmountCents(1000, 5000, 1)).toBe(500);
	});

	it("scales linearly with quantity: 5000bp weight, quantity=2 → 1000", () => {
		expect(computeFinalAmountCents(1000, 5000, 2)).toBe(1000);
	});

	it("floors the product: base=3, weight=3333, qty=1 → floor(0.9999) = 0", () => {
		// 3 * 3333 * 1 / 10000 = 0.9999 → Math.floor → 0
		expect(computeFinalAmountCents(3, 3333, 1)).toBe(0);
	});

	it("floors the product: base=100, weight=3333, qty=3 → floor(99.99) = 99", () => {
		// 100 * 3333 * 3 / 10000 = 99.99 → Math.floor → 99
		expect(computeFinalAmountCents(100, 3333, 3)).toBe(99);
	});

	it("multiplies all three factors before the single floor (no per-unit rounding loss)", () => {
		// base=1, weight=3333, qty=3 → 1*3333*3/10000 = 9999/10000 = 0.9999 → 0
		// Without fix #1 (floor per unit): floor(1*3333/10000)*3 = 0*3 = 0 — same here
		// But with base=10, weight=3333, qty=3 → 10*3333*3/10000 = 9.999 → 9
		// Per-unit naive: floor(10*3333/10000)*3 = floor(3.333)*3 = 3*3 = 9 — coincides
		// Distinguishing case: base=5, weight=6667, qty=3 → 5*6667*3/10000=10.0005 → 10
		// Per-unit naive: floor(5*6667/10000)*3 = floor(3.3335)*3 = 3*3 = 9 — diverges
		expect(computeFinalAmountCents(5, 6667, 3)).toBe(10);
	});
});
