/**
 * Scope-expansion / RBAC guard tests for the customer-directory service.
 *
 * These exercise the subtree-expansion conversion (exact-equality branch filter →
 * resolveScopeNodeIds). The out-of-scope cases assert the guard fires BEFORE any
 * DB query, so they run without a live database. Row-correctness (a non-leaf
 * scope returning its branches' customers) needs a live tenant DB and is covered
 * by the integration suite.
 */

import { describe, expect, it } from "bun:test";
import {
	getCustomerStats,
	listCustomerDirectory,
} from "./customer-directory.service";
import { BranchAccessDeniedError } from "./hierarchy-scope";

const REGION = "11111111-1111-4111-8111-111111111111";
const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_OUTSIDE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ORG = "00000000-0000-4000-8000-000000000000";

// Fake DBs whose `.execute`/`.select` throw if reached. The guard inside
// resolveScopeNodeIds must throw first, so these are never called for the
// out-of-scope cases (we assert that by failing loudly if they are).
function explodingTenantDb() {
	let called = 0;
	const db = {
		execute: async () => {
			called += 1;
			throw new Error("tenantDb.execute should not run after guard rejects");
		},
		select: () => {
			called += 1;
			throw new Error("tenantDb.select should not run after guard rejects");
		},
	} as unknown as Parameters<typeof listCustomerDirectory>[1];
	return { db, calls: () => called };
}

function explodingControlPanelDb() {
	return {
		select: () => {
			throw new Error("controlPanelDb should not be touched");
		},
	} as unknown as Parameters<typeof listCustomerDirectory>[0];
}

describe("listCustomerDirectory — scope guard", () => {
	it("rejects an out-of-scope branchId with FORBIDDEN before any DB hit", async () => {
		const { db, calls } = explodingTenantDb();
		await expect(
			listCustomerDirectory(explodingControlPanelDb(), db, ORG, {
				branchId: BRANCH_OUTSIDE,
				accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
		expect(calls()).toBe(0);
	});

	it("short-circuits to empty when accessibleNodeIds is empty (no DB hit)", async () => {
		const { db, calls } = explodingTenantDb();
		const result = await listCustomerDirectory(
			explodingControlPanelDb(),
			db,
			ORG,
			{ branchId: BRANCH_A, accessibleNodeIds: [] },
		);
		expect(result).toEqual({ rows: [], total: 0 });
		expect(calls()).toBe(0);
	});
});

describe("getCustomerStats — scope guard", () => {
	it("rejects an out-of-scope branchId with FORBIDDEN before any DB hit", async () => {
		const { db, calls } = explodingTenantDb();
		await expect(
			getCustomerStats(db, {
				accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
				branchId: BRANCH_OUTSIDE,
			}),
		).rejects.toThrow(BranchAccessDeniedError);
		expect(calls()).toBe(0);
	});

	it("short-circuits to zeroed stats when accessibleNodeIds is empty (no DB hit)", async () => {
		const { db, calls } = explodingTenantDb();
		const result = await getCustomerStats(db, {
			accessibleNodeIds: [],
			branchId: BRANCH_A,
		});
		expect(result).toEqual({
			totalCount: 0,
			activeCount: 0,
			lapsedCount: 0,
			leadCount: 0,
			avgLifetimeValueCents: 0,
		});
		expect(calls()).toBe(0);
	});
});
