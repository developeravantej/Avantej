/**
 * Check-Ins Service — scope (subtree-expansion) RBAC tests.
 *
 * These pin the conversion of the caller-supplied branch filter from
 * exact-equality to SUBTREE expansion via `resolveScopeNodeIds`:
 *
 *   - listTodaysBookings: a non-leaf scope node (country/region/state) now
 *     filters appointments by its accessible subtree instead of an exact
 *     `eq(appointments.branchId, branchId)`.
 *   - listCheckIns: the optional caller-supplied `branchId` filter likewise
 *     expands to the subtree, while the PRIMARY accessibleNodeIds RBAC filter
 *     stays untouched.
 *
 * The correctness layer verified here is the GUARD: an out-of-scope scope id
 * throws BranchAccessDeniedError (mapped to FORBIDDEN upstream) BEFORE any DB
 * query — so it runs without a live DB (the fake db's `execute`/`select`
 * throws a marker if ever reached, proving the guard fired first).
 *
 * Row-correctness (non-leaf scope → subtree rows) requires a live tenant DB
 * (recursive CTE in getDescendantNodeIds) and is therefore exercised by the
 * integration suite, not here.
 *
 * Run: bun test src/check-ins.scope.test.ts
 */

import { describe, expect, it } from "bun:test";
import { listCheckIns, listTodaysBookings } from "./check-ins.service";
import { BranchAccessDeniedError } from "./hierarchy-scope";

const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_OUTSIDE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const REACHED_DB = "DB_SHOULD_NOT_BE_REACHED";

/**
 * Fake tenantDb/controlPanelDb whose query-surface throws a marker. If the
 * guard fires first (as it must for an out-of-scope scope id), none of these
 * are ever invoked, so the rejection is the guard's BranchAccessDeniedError.
 */
function trapDb<T>(): T {
	const trap = () => {
		throw new Error(REACHED_DB);
	};
	return {
		execute: trap,
		select: trap,
		query: new Proxy(
			{},
			{
				get: () => ({ findFirst: trap, findMany: trap }),
			},
		),
	} as unknown as T;
}

describe("listTodaysBookings — subtree scope guard", () => {
	it("throws BranchAccessDeniedError for an out-of-scope branchId, before any DB hit", async () => {
		const tenantDb = trapDb<Parameters<typeof listTodaysBookings>[0]>();
		const controlPanelDb = trapDb<Parameters<typeof listTodaysBookings>[1]>();

		await expect(
			listTodaysBookings(tenantDb, controlPanelDb, {
				branchId: BRANCH_OUTSIDE,
				date: new Date("2026-06-26"),
				accessibleNodeIds: [BRANCH_A, BRANCH_B],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
	});
});

describe("listCheckIns — subtree scope guard", () => {
	it("throws BranchAccessDeniedError for an out-of-scope branchId, before any DB hit", async () => {
		const tenantDb = trapDb<Parameters<typeof listCheckIns>[0]>();
		const controlPanelDb = trapDb<Parameters<typeof listCheckIns>[1]>();

		await expect(
			listCheckIns(tenantDb, controlPanelDb, {
				branchId: BRANCH_OUTSIDE,
				accessibleNodeIds: [BRANCH_A, BRANCH_B],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
	});

	it("fails closed (returns empty) when the caller has no accessible nodes, without a DB hit", async () => {
		const tenantDb = trapDb<Parameters<typeof listCheckIns>[0]>();
		const controlPanelDb = trapDb<Parameters<typeof listCheckIns>[1]>();

		// Empty accessibleNodeIds short-circuits to empty BEFORE the scope filter,
		// so no DB query and no scope expansion occurs.
		const result = await listCheckIns(tenantDb, controlPanelDb, {
			branchId: BRANCH_A,
			accessibleNodeIds: [],
		});
		expect(result).toEqual({ rows: [], total: 0 });
	});
});
