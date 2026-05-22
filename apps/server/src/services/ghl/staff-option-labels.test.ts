import { describe, expect, test } from "bun:test";
import { buildStaffOptionLabels } from "./staff-option-labels";

describe("buildStaffOptionLabels", () => {
	test("unique names pass through unchanged", () => {
		const out = buildStaffOptionLabels([
			{ memberId: "m1", name: "Afifah Zahra", branchName: "KL Central" },
			{ memberId: "m2", name: "Alex Wong", branchName: "Penang" },
		]);
		expect(out).toEqual([
			{ memberId: "m1", label: "Afifah Zahra" },
			{ memberId: "m2", label: "Alex Wong" },
		]);
	});

	test("duplicate names in different branches get branch-disambiguated (both)", () => {
		const out = buildStaffOptionLabels([
			{ memberId: "m1", name: "Alex Tan", branchName: "KL Central" },
			{ memberId: "m2", name: "Alex Tan", branchName: "Penang" },
		]);
		expect(out).toEqual([
			{ memberId: "m1", label: "Alex Tan (KL Central)" },
			{ memberId: "m2", label: "Alex Tan (Penang)" },
		]);
	});

	test("duplicate name AND branch falls back to short-id suffix", () => {
		const out = buildStaffOptionLabels([
			{ memberId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Alex Tan", branchName: "KL" },
			{ memberId: "11111111-2222-3333-4444-555555555555", name: "Alex Tan", branchName: "KL" },
		]);
		// first keeps the branch label, second must be globally unique
		expect(out[0]).toEqual({ memberId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", label: "Alex Tan (KL)" });
		expect(out[1]?.label).toBe("Alex Tan #111111");
		// all labels unique
		const labels = out.map((o) => o.label.toLowerCase());
		expect(new Set(labels).size).toBe(labels.length);
	});

	test("case-insensitive collision detection", () => {
		const out = buildStaffOptionLabels([
			{ memberId: "m1", name: "alex tan", branchName: "KL" },
			{ memberId: "m2", name: "ALEX TAN", branchName: "Penang" },
		]);
		expect(out[0]?.label).toBe("alex tan (KL)");
		expect(out[1]?.label).toBe("ALEX TAN (Penang)");
	});

	test("blank names are skipped; whitespace trimmed", () => {
		const out = buildStaffOptionLabels([
			{ memberId: "m1", name: "  Afifah  ", branchName: null },
			{ memberId: "m2", name: "   ", branchName: null },
		]);
		expect(out).toEqual([{ memberId: "m1", label: "Afifah" }]);
	});

	test("duplicate name with no branch falls back to short-id", () => {
		const out = buildStaffOptionLabels([
			{ memberId: "aaaaaaaa1111", name: "No Branch", branchName: null },
			{ memberId: "bbbbbbbb2222", name: "No Branch", branchName: null },
		]);
		expect(out[0]?.label).toBe("No Branch");
		expect(out[1]?.label).toBe("No Branch #bbbbbb");
	});
});
