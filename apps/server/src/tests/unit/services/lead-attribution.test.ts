import { describe, expect, test } from "bun:test";

import {
	enrichPosItemTrainerAssignments,
	mergeLeadAttributionIntoStaffAssignments,
} from "@avantej-core/services/lead-attribution.service";

describe("mergeLeadAttributionIntoStaffAssignments", () => {
	test("returns empty-derived slot 0 when no assignments", () => {
		expect(mergeLeadAttributionIntoStaffAssignments([], "lead-user")).toEqual([
			{ staffId: "lead-user", slotIndex: 0 },
		]);
	});

	test("no-op when lead already assigned", () => {
		const existing = [{ staffId: "lead-user", slotIndex: 0 }];
		expect(
			mergeLeadAttributionIntoStaffAssignments(existing, "lead-user"),
		).toEqual(existing);
	});

	test("prepends lead at slot 0 when no slot 0 exists", () => {
		expect(
			mergeLeadAttributionIntoStaffAssignments(
				[{ staffId: "coach-b", slotIndex: 1 }],
				"lead-user",
			),
		).toEqual([
			{ staffId: "lead-user", slotIndex: 0 },
			{ staffId: "coach-b", slotIndex: 2 },
		]);
	});

	test("moves delivery coach to slot 1 when slot 0 occupied", () => {
		expect(
			mergeLeadAttributionIntoStaffAssignments(
				[{ staffId: "coach-b", slotIndex: 0 }],
				"lead-user",
			),
		).toEqual([
			{ staffId: "lead-user", slotIndex: 0 },
			{ staffId: "coach-b", slotIndex: 1 },
		]);
	});
});

describe("enrichPosItemTrainerAssignments", () => {
	test("fills every line when input is undefined", () => {
		expect(
			enrichPosItemTrainerAssignments(
				[{ type: "package" }, { type: "product" }],
				undefined,
				"lead-user",
			),
		).toEqual({
			0: [{ staffId: "lead-user", slotIndex: 0 }],
			1: [{ staffId: "lead-user", slotIndex: 0 }],
		});
	});

	test("merges with explicit delivery coach on a line", () => {
		expect(
			enrichPosItemTrainerAssignments(
				[{ type: "product" }],
				{ 0: [{ staffId: "coach-b", slotIndex: 0 }] },
				"lead-user",
			),
		).toEqual({
			0: [
				{ staffId: "lead-user", slotIndex: 0 },
				{ staffId: "coach-b", slotIndex: 1 },
			],
		});
	});
});
