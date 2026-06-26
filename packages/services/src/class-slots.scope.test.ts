import { describe, expect, it } from "bun:test";
import { BranchAccessDeniedError } from "./hierarchy-scope";
import { getBookingCounts, listClassSlots } from "./class-slots.service";

// Scope-switcher conversion: class-slots list/bookingCounts now expand the
// picked scope node to its accessible SUBTREE (via resolveScopeNodeIds) instead
// of an exact-equality branch match. These tests assert the RBAC guard still
// fires for an out-of-scope scope node WITHOUT needing a live DB — the guard
// (assertBranchAccessible, inside resolveScopeNodeIds) throws before any query.

const REGION = "11111111-1111-4111-8111-111111111111";
const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_OUTSIDE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

// Fake tenantDb: for the out-of-scope path the guard throws BEFORE any DB
// access, so execute/select are never invoked. `calls` lets us assert that.
type FakeDb = Parameters<typeof listClassSlots>[0];
function fakeDb(ids: string[]): { db: FakeDb; calls: () => number } {
	let callCount = 0;
	const fail = () => {
		callCount += 1;
		throw new Error("DB should not be hit when scope guard rejects");
	};
	const db = {
		execute: async () => {
			callCount += 1;
			return { rows: ids.map((id) => ({ id })) };
		},
		select: fail,
	} as unknown as FakeDb;
	return { db, calls: () => callCount };
}

describe("listClassSlots scope guard", () => {
	it("rejects an out-of-scope scope node with FORBIDDEN (no DB hit)", async () => {
		const { db, calls } = fakeDb([]);
		await expect(
			listClassSlots(db, {
				branchId: BRANCH_OUTSIDE,
				accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
		// Guard fires before subtree expansion or the slot query.
		expect(calls()).toBe(0);
	});
});

describe("getBookingCounts scope guard", () => {
	it("rejects an out-of-scope scope node with FORBIDDEN (no DB hit)", async () => {
		const { db, calls } = fakeDb([]);
		await expect(
			getBookingCounts(db, {
				branchId: BRANCH_OUTSIDE,
				from: new Date("2026-01-01"),
				to: new Date("2026-12-31"),
				accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
		expect(calls()).toBe(0);
	});
});
