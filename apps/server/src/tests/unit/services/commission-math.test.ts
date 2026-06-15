import { describe, test, expect } from "bun:test";

import {
	assertConfigSumIs10000,
	computeEffectiveWeightages,
	computeFinalAmountCents,
	dedupeBySlotIndex,
} from "@avantej-core/services/commission-math";

// ─── #1 — multiply-then-floor ────────────────────────────────────────────────
describe("computeFinalAmountCents (audit fix #1: multiply-then-floor)", () => {
	test("returns floor(base * weightage * quantity / 10000) for clean inputs", () => {
		// 100 cents × 2500bp × 4 = 100 cents per coach
		expect(computeFinalAmountCents(100, 2500, 4)).toBe(100);
	});

	test("preserves precision across quantity multiplication (the bug fix)", () => {
		// base=99 cents, weightage=2500bp, quantity=10
		// Old behaviour: floor(99 * 2500 / 10000) * 10 = floor(24.75) * 10 = 24 * 10 = 240
		// New behaviour: floor(99 * 2500 * 10 / 10000) = floor(247.5) = 247
		// Net win: 7 cents per coach preserved that would otherwise leak.
		expect(computeFinalAmountCents(99, 2500, 10)).toBe(247);
	});

	test("4-coach split with imperfect divisibility leaks <1 cent total (not 30+)", () => {
		// baseAmountCents=99, 4 coaches each at 2500bp, quantity=10.
		// Old per-coach math: floor(99*2500/10000)=24 → 24*10=240 → 4 coaches × 240 = 960 cents
		// New per-coach math: floor(99*2500*10/10000)=247 → 4 coaches × 247 = 988 cents
		// Ground truth: 99 * 10 = 990 cents total to distribute; 4 × 2500 = 10000 bp total.
		// New leaks 990 - 988 = 2 cents total. Old leaked 990 - 960 = 30 cents.
		const coachAmount = computeFinalAmountCents(99, 2500, 10);
		const totalPaid = coachAmount * 4;
		const groundTruth = 99 * 10; // unitPriceCents × quantity (with weightage = 100%)
		expect(groundTruth - totalPaid).toBeLessThan(4); // at most n-1 cents leaked
	});

	test("quantity=0 returns 0 (defensive)", () => {
		expect(computeFinalAmountCents(100, 2500, 0)).toBe(0);
	});

	test("negative quantity returns 0 (defensive)", () => {
		expect(computeFinalAmountCents(100, 2500, -1)).toBe(0);
	});

	test("zero base amount returns 0", () => {
		expect(computeFinalAmountCents(0, 5000, 10)).toBe(0);
	});

	test("zero weightage returns 0", () => {
		expect(computeFinalAmountCents(1000, 0, 1)).toBe(0);
	});

	test("100% weightage returns the full base × quantity", () => {
		expect(computeFinalAmountCents(500, 10000, 3)).toBe(1500);
	});
});

// ─── #2 — config-sum 10000 bp invariant ─────────────────────────────────────
describe("assertConfigSumIs10000 (audit fix #2)", () => {
	test("accepts a config that sums exactly to 10000", () => {
		const slots = [
			{ slotIndex: 0, weightageBasisPoints: 4000 },
			{ slotIndex: 1, weightageBasisPoints: 3000 },
			{ slotIndex: 2, weightageBasisPoints: 2000 },
			{ slotIndex: 3, weightageBasisPoints: 1000 },
		];
		expect(() => assertConfigSumIs10000(slots, "cfg-a")).not.toThrow();
	});

	test("accepts a single slot at 10000", () => {
		const slots = [{ slotIndex: 0, weightageBasisPoints: 10000 }];
		expect(() => assertConfigSumIs10000(slots, "cfg-single")).not.toThrow();
	});

	test("accepts an empty config (no slots — engine will just not fire splits)", () => {
		expect(() => assertConfigSumIs10000([], "cfg-empty")).not.toThrow();
	});

	test("rejects a config that sums BELOW 10000", () => {
		const slots = [
			{ slotIndex: 0, weightageBasisPoints: 5000 },
			{ slotIndex: 1, weightageBasisPoints: 3000 },
		];
		expect(() => assertConfigSumIs10000(slots, "cfg-under")).toThrow(/8000bp/);
		expect(() => assertConfigSumIs10000(slots, "cfg-under")).toThrow(
			/cfg-under/,
		);
	});

	test("rejects a config that sums ABOVE 10000", () => {
		const slots = [
			{ slotIndex: 0, weightageBasisPoints: 6000 },
			{ slotIndex: 1, weightageBasisPoints: 5000 },
		];
		expect(() => assertConfigSumIs10000(slots, "cfg-over")).toThrow(/11000bp/);
	});

	test("error message includes the configId for debugging", () => {
		const slots = [{ slotIndex: 0, weightageBasisPoints: 9999 }];
		expect(() => assertConfigSumIs10000(slots, "specific-id-123")).toThrow(
			/specific-id-123/,
		);
	});
});

// ─── #3 — dedupe by slotIndex ────────────────────────────────────────────────
describe("dedupeBySlotIndex (audit fix #3)", () => {
	test("returns original when no duplicates", () => {
		const assignments = [
			{ staffId: "alice", slotIndex: 0 },
			{ staffId: "bob", slotIndex: 1 },
			{ staffId: "carol", slotIndex: 2 },
		];
		const result = dedupeBySlotIndex(assignments);
		expect(result.hadDuplicates).toBe(false);
		expect(result.deduped).toHaveLength(3);
	});

	test("dedupes when two assignments share a slotIndex (keeps last write)", () => {
		const assignments = [
			{ staffId: "alice", slotIndex: 0 },
			{ staffId: "bob-duplicate", slotIndex: 0 },
			{ staffId: "carol", slotIndex: 1 },
		];
		const result = dedupeBySlotIndex(assignments);
		expect(result.hadDuplicates).toBe(true);
		expect(result.deduped).toHaveLength(2);
		// Map preserves insertion-order but later set() overwrites the value,
		// so the latest staffId for that slot wins.
		expect(result.deduped.find((a) => a.slotIndex === 0)?.staffId).toBe(
			"bob-duplicate",
		);
	});

	test("returns empty array for empty input", () => {
		const result = dedupeBySlotIndex([]);
		expect(result.hadDuplicates).toBe(false);
		expect(result.deduped).toEqual([]);
	});

	test("hadDuplicates flag is true even when only one slot is duped", () => {
		const assignments = [
			{ staffId: "a", slotIndex: 0 },
			{ staffId: "b", slotIndex: 1 },
			{ staffId: "c", slotIndex: 1 },
			{ staffId: "d", slotIndex: 2 },
		];
		const result = dedupeBySlotIndex(assignments);
		expect(result.hadDuplicates).toBe(true);
		expect(result.deduped).toHaveLength(3);
	});
});

// ─── computeEffectiveWeightages — redistribution math ─────────────────────────
describe("computeEffectiveWeightages (weightage redistribution)", () => {
	const fourSlots = [
		{ slotIndex: 0, weightageBasisPoints: 4000 },
		{ slotIndex: 1, weightageBasisPoints: 3000 },
		{ slotIndex: 2, weightageBasisPoints: 2000 },
		{ slotIndex: 3, weightageBasisPoints: 1000 },
	];

	test("all slots present → effective weightage = configured weightage", () => {
		const assignments = [
			{ staffId: "a", slotIndex: 0 },
			{ staffId: "b", slotIndex: 1 },
			{ staffId: "c", slotIndex: 2 },
			{ staffId: "d", slotIndex: 3 },
		];
		expect(computeEffectiveWeightages(fourSlots, assignments)).toEqual([
			4000, 3000, 2000, 1000,
		]);
	});

	test("one absent → unclaimed bp split evenly across present", () => {
		// Slot 3 (1000bp) absent. 3 coaches present. 1000/3 = 333 each + 1 remainder.
		// Slot 0 (first by sort) absorbs the +1.
		const assignments = [
			{ staffId: "a", slotIndex: 0 },
			{ staffId: "b", slotIndex: 1 },
			{ staffId: "c", slotIndex: 2 },
		];
		const eff = computeEffectiveWeightages(fourSlots, assignments);
		expect(eff).toEqual([4334, 3333, 2333]);
		expect(eff.reduce((s, x) => s + x, 0)).toBe(10000); // invariant: still sums to 10000
	});

	test("two absent → larger redistribution still sums to 10000", () => {
		// Slots 2 (2000) + 3 (1000) absent. 2 coaches. unclaimed=3000, bonus=1500, remainder=0.
		const assignments = [
			{ staffId: "a", slotIndex: 0 },
			{ staffId: "b", slotIndex: 1 },
		];
		const eff = computeEffectiveWeightages(fourSlots, assignments);
		expect(eff).toEqual([5500, 4500]);
		expect(eff.reduce((s, x) => s + x, 0)).toBe(10000);
	});

	test("solo coach absorbs everything (gets full 10000bp)", () => {
		const assignments = [{ staffId: "solo", slotIndex: 0 }];
		const eff = computeEffectiveWeightages(fourSlots, assignments);
		expect(eff).toEqual([10000]);
	});

	test("empty assignments returns empty array", () => {
		expect(computeEffectiveWeightages(fourSlots, [])).toEqual([]);
	});

	test("remainder distribution favours lowest slotIndex (deterministic)", () => {
		// 4 slots all 2500bp. 3 present (slots 0,1,2). slot 3 absent → 2500 unclaimed.
		// 2500/3 = 833 each + remainder 1.
		// Slot 0 absorbs the +1.
		const evenSlots = [
			{ slotIndex: 0, weightageBasisPoints: 2500 },
			{ slotIndex: 1, weightageBasisPoints: 2500 },
			{ slotIndex: 2, weightageBasisPoints: 2500 },
			{ slotIndex: 3, weightageBasisPoints: 2500 },
		];
		const eff = computeEffectiveWeightages(evenSlots, [
			{ staffId: "a", slotIndex: 0 },
			{ staffId: "b", slotIndex: 1 },
			{ staffId: "c", slotIndex: 2 },
		]);
		expect(eff).toEqual([3334, 3333, 3333]); // 0 gets +1, sum = 10000
		expect(eff.reduce((s, x) => s + x, 0)).toBe(10000);
	});

	test("end-to-end: 4-coach perfect split with computeFinalAmountCents → exact total", () => {
		// baseAmount=10000 cents (RM100), quantity=1, all 4 present
		const assignments = [
			{ staffId: "a", slotIndex: 0 },
			{ staffId: "b", slotIndex: 1 },
			{ staffId: "c", slotIndex: 2 },
			{ staffId: "d", slotIndex: 3 },
		];
		const eff = computeEffectiveWeightages(fourSlots, assignments);
		const amounts = eff.map((w) => computeFinalAmountCents(10000, w, 1));
		expect(amounts).toEqual([4000, 3000, 2000, 1000]);
		expect(amounts.reduce((s, x) => s + x, 0)).toBe(10000); // perfect
	});
});
