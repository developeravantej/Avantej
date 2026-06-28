import { describe, expect, it } from "bun:test";
import {
	assertBranchAccessible,
	BranchAccessDeniedError,
	isBranchAccessDeniedError,
	resolveScopeNodeIds,
} from "./hierarchy-scope";

const REGION = "11111111-1111-4111-8111-111111111111";
const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_OUTSIDE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

// Fake tenantDb: getDescendantNodeIds() calls tenantDb.execute(sql`...`) and
// reads `.rows` (array of { id }). We stub execute to return the supplied ids
// and record whether it was called (to assert "no DB hit" cases).
type FakeDb = Parameters<typeof resolveScopeNodeIds>[0];
function fakeDb(ids: string[]): { db: FakeDb; calls: () => number } {
	let callCount = 0;
	const db = {
		execute: async () => {
			callCount += 1;
			return { rows: ids.map((id) => ({ id })) };
		},
	} as unknown as FakeDb;
	return { db, calls: () => callCount };
}

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

describe("resolveScopeNodeIds", () => {
	it("expands a non-leaf node to its subtree, intersected with the accessible ceiling (non-admin)", async () => {
		const { db } = fakeDb([REGION, BRANCH_A, BRANCH_B, BRANCH_OUTSIDE]);
		const result = await resolveScopeNodeIds(db, REGION, [
			REGION,
			BRANCH_A,
			BRANCH_B,
		]);
		// BRANCH_OUTSIDE is in the subtree but NOT in the ceiling → filtered out.
		expect(result).toEqual([REGION, BRANCH_A, BRANCH_B]);
	});

	it("returns a single leaf when the scope is a leaf branch (non-admin)", async () => {
		const { db } = fakeDb([BRANCH_A]);
		const result = await resolveScopeNodeIds(db, BRANCH_A, [
			REGION,
			BRANCH_A,
			BRANCH_B,
		]);
		expect(result).toEqual([BRANCH_A]);
	});

	it("rejects an out-of-scope scope node (non-admin)", async () => {
		const { db, calls } = fakeDb([]);
		await expect(
			resolveScopeNodeIds(db, BRANCH_OUTSIDE, [REGION, BRANCH_A]),
		).rejects.toThrow(BranchAccessDeniedError);
		// Guard fires before any DB expansion.
		expect(calls()).toBe(0);
	});

	it("returns the accessible set verbatim when no scope is picked (non-admin), without a DB call", async () => {
		const { db, calls } = fakeDb([REGION, BRANCH_A]);
		const result = await resolveScopeNodeIds(db, undefined, [REGION, BRANCH_A]);
		expect(result).toEqual([REGION, BRANCH_A]);
		expect(calls()).toBe(0);
	});

	it("returns the full subtree unrestricted for admin (empty ceiling) with a scope node", async () => {
		const { db } = fakeDb([REGION, BRANCH_A]);
		const result = await resolveScopeNodeIds(db, REGION, []);
		// No ceiling intersection for admin.
		expect(result).toEqual([REGION, BRANCH_A]);
	});

	it("returns empty (org-wide, no filter) for admin (empty ceiling) with no scope node", async () => {
		const { db, calls } = fakeDb([REGION, BRANCH_A]);
		const result = await resolveScopeNodeIds(db, undefined, []);
		expect(result).toEqual([]);
		expect(calls()).toBe(0);
	});
});

describe("isBranchAccessDeniedError", () => {
	it("detects BranchAccessDeniedError", () => {
		expect(
			isBranchAccessDeniedError(new BranchAccessDeniedError(BRANCH_A)),
		).toBe(true);
	});
});
