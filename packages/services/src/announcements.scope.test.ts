/**
 * announcements.service — scope (subtree-expansion) guard tests.
 *
 * Covers listAnnouncements' conversion from exact-equality branch filtering
 * (`eq(announcements.branchId, branchId)`) to subtree expansion via
 * resolveScopeNodeIds (`inArray(announcements.branchId, scopeIds)`).
 *
 * These run WITHOUT a live DB: the RBAC guard in resolveScopeNodeIds throws
 * for an out-of-scope scope node BEFORE any tenantDb query is issued.
 * Row-correctness for a non-leaf scope (subtree returns its branches' rows)
 * needs a live tenant DB — see the skipped integration test at the bottom.
 *
 * NOTE: only the listAnnouncements path is converted here. listActive
 * (listActiveAnnouncements) is a separate procedure and is intentionally
 * untouched.
 */

import { describe, expect, it } from "bun:test";
import { listAnnouncements } from "./announcements.service";
import { BranchAccessDeniedError } from "./hierarchy-scope";

const REGION = "11111111-1111-4111-8111-111111111111";
const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_OUTSIDE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

// Fake tenantDb whose query methods throw if ever reached — proving the guard
// fires before any DB access. listAnnouncements(tenantDb, params) uses
// `.select` / `.execute`; either throwing is enough to detect a leaked query.
type Db = Parameters<typeof listAnnouncements>[0];
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

describe("listAnnouncements — scope guard", () => {
	it("rejects an out-of-scope branchId with FORBIDDEN before any DB query", async () => {
		const tenantDb = explodingDb();

		await expect(
			listAnnouncements(tenantDb, {
				branchId: BRANCH_OUTSIDE, // not within the accessible ceiling
				accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
	});

	it("rejects an out-of-scope branchId even with an isActive filter present", async () => {
		const tenantDb = explodingDb();

		await expect(
			listAnnouncements(tenantDb, {
				branchId: BRANCH_OUTSIDE,
				isActive: true,
				accessibleNodeIds: [BRANCH_A],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
	});
});

/**
 * Row-correctness: a NON-LEAF scope node (e.g. REGION) must return the
 * announcements of its descendant branches, not zero. This requires a live
 * tenant DB with a hierarchy + seeded announcements, so it is skipped in the
 * sandbox. Enable by wiring a real tenantDb and seed fixtures.
 */
describe.skip("listAnnouncements — subtree expansion (needs live DB)", () => {
	it("returns descendant-branch announcements when scope is a non-leaf region node", async () => {
		// Seed: REGION → { BRANCH_A, BRANCH_B }; announcements tagged with
		// branchId=BRANCH_A and branchId=BRANCH_B. Calling with branchId=REGION
		// should return BOTH announcements (subtree), where the old
		// exact-equality filter (eq(branchId, REGION)) returned 0.
		expect(true).toBe(true);
	});
});
