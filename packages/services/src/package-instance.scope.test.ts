/**
 * package-instance.service — scope (subtree-expansion) guard tests.
 *
 * Covers listMemberships' conversion from exact-equality branch filtering
 * (`m.hierarchy_scope_id = ${branchId}::uuid`) to subtree expansion via
 * resolveScopeNodeIds (`= ANY(${scopeIds}::uuid[])`).
 *
 * These run WITHOUT a live DB: the RBAC guard in resolveScopeNodeIds throws
 * for an out-of-scope scope node BEFORE any tenantDb.execute is issued, and the
 * empty-ceiling early-return needs no query either. Row-correctness for a
 * non-leaf scope (subtree returns its branches' rows) needs a live tenant DB —
 * see the skipped integration test at the bottom.
 */

import { describe, expect, it } from "bun:test";
import { listMemberships } from "./package-instance.service";
import { BranchAccessDeniedError } from "./hierarchy-scope";

const REGION = "11111111-1111-4111-8111-111111111111";
const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_OUTSIDE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

// Fake DBs whose `.execute` throws if ever reached — proving the guard /
// early-return fires before any query. listMemberships(controlPanelDb,
// tenantDb, params); only `.execute` is used on tenantDb in these paths.
type Db = Parameters<typeof listMemberships>[0];
function explodingDb(): Db {
	return {
		execute: async () => {
			throw new Error("DB should not be queried in this path");
		},
		select: () => {
			throw new Error("DB should not be queried in this path");
		},
	} as unknown as Db;
}

describe("listMemberships — scope guard", () => {
	it("rejects an out-of-scope branchId with FORBIDDEN before any DB query", async () => {
		const controlPanelDb = explodingDb();
		const tenantDb = explodingDb() as unknown as Parameters<
			typeof listMemberships
		>[1];

		await expect(
			listMemberships(controlPanelDb, tenantDb, {
				filter: "all",
				branchId: BRANCH_OUTSIDE, // not within the accessible ceiling
				accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
	});

	it("returns empty without a DB query when accessibleNodeIds is empty (no branch attributable)", async () => {
		const controlPanelDb = explodingDb();
		const tenantDb = explodingDb() as unknown as Parameters<
			typeof listMemberships
		>[1];

		const result = await listMemberships(controlPanelDb, tenantDb, {
			filter: "all",
			accessibleNodeIds: [],
		});
		expect(result).toEqual({ rows: [], total: 0 });
	});
});

/**
 * Row-correctness: a NON-LEAF scope node (e.g. REGION) must return the rows of
 * its descendant branches, not zero. This requires a live tenant DB with a
 * hierarchy + seeded package_instances/members, so it is skipped in the
 * sandbox. Enable by wiring a real tenantDb and seed fixtures.
 */
describe.skip("listMemberships — subtree expansion (needs live DB)", () => {
	it("returns descendant-branch rows when scope is a non-leaf region node", async () => {
		// Seed: REGION → { BRANCH_A, BRANCH_B }; members in BRANCH_A/BRANCH_B with
		// package_instances. Calling with branchId=REGION should return rows from
		// BOTH branches (subtree), where the old exact-equality filter returned 0.
		expect(true).toBe(true);
	});
});
