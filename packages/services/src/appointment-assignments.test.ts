/**
 * Unit tests for `resolveEffectiveAssignments` — the kernel of the
 * "commission reaches trainers in all cases" invariant (CLAUDE.md).
 *
 * Two ways a trainer ends up on an appointment must BOTH yield a commission
 * assignment:
 *   - requested:  explicit `appointment_staff` slot rows
 *   - rotation:   no slot rows, trainer resolved onto `appointment.trainerId`
 *
 * The only case that yields no assignment (and thus no commission) is when
 * there is genuinely no staff at all — the caller then skips with an audit.
 */

import { describe, expect, it } from "bun:test";
import { resolveEffectiveAssignments } from "./appointment.service";

describe("resolveEffectiveAssignments", () => {
	// --- requested path: explicit slot rows -------------------------------

	it("uses explicit slot assignments when present", () => {
		const result = resolveEffectiveAssignments(
			[
				{ staffId: "trainer-a", slotIndex: 0 },
				{ staffId: "trainer-b", slotIndex: 1 },
			],
			"fallback-trainer",
		);
		expect(result).toEqual([
			{ staffId: "trainer-a", slotIndex: 0 },
			{ staffId: "trainer-b", slotIndex: 1 },
		]);
	});

	it("orders explicit assignments by slotIndex regardless of input order", () => {
		const result = resolveEffectiveAssignments(
			[
				{ staffId: "trainer-b", slotIndex: 2 },
				{ staffId: "trainer-a", slotIndex: 0 },
				{ staffId: "trainer-c", slotIndex: 1 },
			],
			null,
		);
		expect(result.map((r) => r.staffId)).toEqual([
			"trainer-a",
			"trainer-c",
			"trainer-b",
		]);
	});

	it("drops rows with a null slotIndex but keeps the valid ones", () => {
		const result = resolveEffectiveAssignments(
			[
				{ staffId: "ghost", slotIndex: null },
				{ staffId: "trainer-a", slotIndex: 0 },
			],
			"fallback-trainer",
		);
		expect(result).toEqual([{ staffId: "trainer-a", slotIndex: 0 }]);
	});

	it("prefers explicit assignments over the trainerId fallback", () => {
		// Even with a resolved appointment.trainerId, explicit rows take priority —
		// the fallback must NOT shadow a real requested assignment.
		const result = resolveEffectiveAssignments(
			[{ staffId: "requested-trainer", slotIndex: 0 }],
			"rotation-trainer",
		);
		expect(result).toEqual([{ staffId: "requested-trainer", slotIndex: 0 }]);
	});

	// --- rotation path: trainerId fallback --------------------------------

	it("falls back to appointment.trainerId at slot 0 when no slot rows exist", () => {
		// The rotation / auto-assigned case: commission must still reach the trainer.
		const result = resolveEffectiveAssignments([], "rotation-trainer");
		expect(result).toEqual([{ staffId: "rotation-trainer", slotIndex: 0 }]);
	});

	it("falls back to trainerId when every slot row was dropped as null", () => {
		const result = resolveEffectiveAssignments(
			[
				{ staffId: "ghost-1", slotIndex: null },
				{ staffId: "ghost-2", slotIndex: null },
			],
			"rotation-trainer",
		);
		expect(result).toEqual([{ staffId: "rotation-trainer", slotIndex: 0 }]);
	});

	// --- no-staff path: empty -> caller skips + audits --------------------

	it("returns [] when there are no slot rows and no trainerId", () => {
		expect(resolveEffectiveAssignments([], null)).toEqual([]);
		expect(resolveEffectiveAssignments([], undefined)).toEqual([]);
	});

	it("returns [] when all rows are null and trainerId is empty string", () => {
		// Empty-string trainerId is falsy and must not produce a phantom split.
		const result = resolveEffectiveAssignments(
			[{ staffId: "ghost", slotIndex: null }],
			"",
		);
		expect(result).toEqual([]);
	});

	// --- edge cases -------------------------------------------------------

	it("keeps slotIndex 0 (not treated as a falsy/missing slot)", () => {
		// Regression guard: filtering on `!== null` must keep 0, otherwise the
		// primary trainer (slot 0) would silently lose their commission.
		const result = resolveEffectiveAssignments(
			[{ staffId: "primary", slotIndex: 0 }],
			null,
		);
		expect(result).toEqual([{ staffId: "primary", slotIndex: 0 }]);
	});

	it("does NOT dedupe duplicate slotIndex — dedup is the planner's job", () => {
		// resolveEffectiveAssignments is deliberately thin: `planSplits` runs
		// dedupeBySlotIndex downstream. If a future refactor moves dedup here,
		// this test forces a conscious decision rather than a silent double-pay.
		const result = resolveEffectiveAssignments(
			[
				{ staffId: "trainer-a", slotIndex: 0 },
				{ staffId: "trainer-b", slotIndex: 0 },
			],
			null,
		);
		expect(result).toHaveLength(2);
	});

	it("passes the same trainer through twice when they occupy multiple slots", () => {
		const result = resolveEffectiveAssignments(
			[
				{ staffId: "trainer-a", slotIndex: 0 },
				{ staffId: "trainer-a", slotIndex: 1 },
			],
			null,
		);
		expect(result).toEqual([
			{ staffId: "trainer-a", slotIndex: 0 },
			{ staffId: "trainer-a", slotIndex: 1 },
		]);
	});

	it("preserves input order for rows sharing the same slotIndex (stable sort)", () => {
		const result = resolveEffectiveAssignments(
			[
				{ staffId: "first", slotIndex: 1 },
				{ staffId: "second", slotIndex: 1 },
			],
			null,
		);
		expect(result.map((r) => r.staffId)).toEqual(["first", "second"]);
	});

	it("sorts negative slotIndex ahead of slot 0", () => {
		const result = resolveEffectiveAssignments(
			[
				{ staffId: "zero", slotIndex: 0 },
				{ staffId: "negative", slotIndex: -1 },
			],
			null,
		);
		expect(result.map((r) => r.staffId)).toEqual(["negative", "zero"]);
	});

	it("does not mutate the caller's staffRows array", () => {
		const input = [
			{ staffId: "b", slotIndex: 1 },
			{ staffId: "a", slotIndex: 0 },
		];
		const snapshot = [...input];
		resolveEffectiveAssignments(input, null);
		expect(input).toEqual(snapshot);
	});
});
