import { describe, expect, it } from "bun:test";
import {
	assertBranchAccessible,
	BranchAccessDeniedError,
	isBranchAccessDeniedError,
	resolveBranchFilter,
} from "./hierarchy-scope";

const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("assertBranchAccessible", () => {
	it("allows undefined branchId", () => {
		expect(() => assertBranchAccessible(undefined, [BRANCH_A])).not.toThrow();
	});

	it("allows branch in accessibleNodeIds", () => {
		expect(() =>
			assertBranchAccessible(BRANCH_A, [BRANCH_A, BRANCH_B]),
		).not.toThrow();
	});

	it("throws when branch is out of scope", () => {
		expect(() => assertBranchAccessible(BRANCH_A, [BRANCH_B])).toThrow(
			BranchAccessDeniedError,
		);
	});

	it("skips enforcement when accessibleNodeIds is empty", () => {
		expect(() => assertBranchAccessible(BRANCH_A, [])).not.toThrow();
	});
});

describe("resolveBranchFilter", () => {
	it("returns single branch when branchId set and in scope", () => {
		expect(resolveBranchFilter(BRANCH_A, [BRANCH_A, BRANCH_B])).toEqual([
			BRANCH_A,
		]);
	});

	it("returns all accessible nodes when branchId omitted", () => {
		expect(resolveBranchFilter(undefined, [BRANCH_A, BRANCH_B])).toEqual([
			BRANCH_A,
			BRANCH_B,
		]);
	});
});

describe("isBranchAccessDeniedError", () => {
	it("detects BranchAccessDeniedError", () => {
		expect(
			isBranchAccessDeniedError(new BranchAccessDeniedError(BRANCH_A)),
		).toBe(true);
	});
});
