/**
 * Scope-expansion tests for `searchPosCustomers` (POS customer lookup).
 *
 * Phase 0.5 — exact-equality → subtree expansion. `branchId` is now consumed as
 * a (possibly non-leaf) scope node and expanded via `resolveScopeNodeIds`, so a
 * country/region/state node returns its branches' members instead of zero.
 *
 * These tests run WITHOUT a live DB:
 * - the out-of-scope guard throws before any query;
 * - the row-correctness case fakes both the tenant DB (members + the recursive
 *   descendant CTE via `execute`) and the control-panel DB (user lookup).
 */

import { describe, expect, it } from "bun:test";
import { searchPosCustomers } from "./pos.service";
import { BranchAccessDeniedError } from "./hierarchy-scope";

const REGION = "11111111-1111-4111-8111-111111111111";
const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_OUTSIDE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

type FakeMember = { userId: string; hierarchyScopeId: string };
type FakeUser = {
	id: string;
	name: string | null;
	email: string | null;
	phone: string | null;
};

// Fake tenant DB:
// - `query.members.findMany()` returns the supplied members.
// - `execute()` backs getDescendantNodeIds()'s recursive CTE (reads `.rows`).
// Tracks call counts so we can assert "guard fires before any DB hit".
function fakeTenantDb(opts: { members: FakeMember[]; subtree: string[] }) {
	let membersCalls = 0;
	let executeCalls = 0;
	const db = {
		query: {
			members: {
				findMany: async () => {
					membersCalls += 1;
					return opts.members;
				},
			},
		},
		execute: async () => {
			executeCalls += 1;
			return { rows: opts.subtree.map((id) => ({ id })) };
		},
	};
	return {
		db: db as unknown as Parameters<typeof searchPosCustomers>[1],
		membersCalls: () => membersCalls,
		executeCalls: () => executeCalls,
	};
}

// Fake control-panel DB: `select().from().where()` resolves to the users array.
function fakeControlPanelDb(users: FakeUser[]) {
	const db = {
		select: () => ({
			from: () => ({
				where: async () => users,
			}),
		}),
	};
	return db as unknown as Parameters<typeof searchPosCustomers>[0];
}

describe("searchPosCustomers — scope expansion", () => {
	it("rejects an out-of-scope branchId with FORBIDDEN (no DB hit)", async () => {
		const { db, membersCalls, executeCalls } = fakeTenantDb({
			members: [],
			subtree: [],
		});
		const cpDb = fakeControlPanelDb([]);

		await expect(
			searchPosCustomers(cpDb, db, {
				query: "ahmad",
				branchId: BRANCH_OUTSIDE,
				accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
			}),
		).rejects.toThrow(BranchAccessDeniedError);

		// Guard throws before any tenant query / descendant expansion.
		expect(membersCalls()).toBe(0);
		expect(executeCalls()).toBe(0);
	});

	it("expands a non-leaf scope node to its subtree and filters members by it", async () => {
		// Member in BRANCH_A is within REGION's subtree; member in BRANCH_OUTSIDE
		// is not, so it must be filtered out even though it matches the query.
		const { db, executeCalls } = fakeTenantDb({
			members: [
				{ userId: "u-a", hierarchyScopeId: BRANCH_A },
				{ userId: "u-out", hierarchyScopeId: BRANCH_OUTSIDE },
			],
			// Recursive CTE for REGION returns the region + its two branches.
			subtree: [REGION, BRANCH_A, BRANCH_B],
		});
		const cpDb = fakeControlPanelDb([
			{ id: "u-a", name: "Ahmad Firdaus", email: "a@test.my", phone: null },
			{ id: "u-out", name: "Ahmad Outsider", email: "o@test.my", phone: null },
		]);

		const results = await searchPosCustomers(cpDb, db, {
			query: "ahmad",
			branchId: REGION,
			accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
		});

		// Subtree expansion happened (DB hit) and only the in-subtree member returns.
		expect(executeCalls()).toBe(1);
		expect(results).toHaveLength(1);
		expect(results[0]?.id).toBe("u-a");
		expect(results[0]?.branchId).toBe(BRANCH_A);
	});

	it("filters by the full accessible ceiling when no scope is picked (no DB hit)", async () => {
		const { db, executeCalls } = fakeTenantDb({
			members: [
				{ userId: "u-a", hierarchyScopeId: BRANCH_A },
				{ userId: "u-out", hierarchyScopeId: BRANCH_OUTSIDE },
			],
			subtree: [],
		});
		const cpDb = fakeControlPanelDb([
			{ id: "u-a", name: "Ahmad Firdaus", email: "a@test.my", phone: null },
			{ id: "u-out", name: "Ahmad Outsider", email: "o@test.my", phone: null },
		]);

		const results = await searchPosCustomers(cpDb, db, {
			query: "ahmad",
			// no branchId → resolveScopeNodeIds returns accessibleNodeIds verbatim
			accessibleNodeIds: [BRANCH_A],
		});

		// No scope picked → no descendant expansion.
		expect(executeCalls()).toBe(0);
		expect(results).toHaveLength(1);
		expect(results[0]?.id).toBe("u-a");
	});

	it("returns [] for an admin/org-wide caller (empty accessibleNodeIds)", async () => {
		const { db } = fakeTenantDb({ members: [], subtree: [] });
		const cpDb = fakeControlPanelDb([]);

		const results = await searchPosCustomers(cpDb, db, {
			query: "ahmad",
			accessibleNodeIds: [],
		});

		expect(results).toEqual([]);
	});
});
