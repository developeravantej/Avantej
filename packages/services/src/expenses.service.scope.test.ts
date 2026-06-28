import { describe, expect, it } from "bun:test";
import { listExpenses } from "./expenses.service";
import { BranchAccessDeniedError } from "./hierarchy-scope";

const REGION = "11111111-1111-4111-8111-111111111111";
const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_OUTSIDE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

type TenantDb = Parameters<typeof listExpenses>[0];

/**
 * Fake tenantDb covering BOTH query paths listExpenses can hit:
 * - `execute(sql)` — the recursive subtree CTE in getDescendantNodeIds
 *   (returns `{ rows: [{ id }] }`).
 * - `select().from().where().orderBy().limit().offset()` — the listing query
 *   (the awaited terminal `.offset()` resolves to the supplied rows).
 *
 * `dbCalls()` counts how many times EITHER path was entered, so the
 * out-of-scope test can assert the guard fired before any DB access.
 */
function fakeDb(
	subtreeIds: string[],
	rows: unknown[] = [],
): { db: TenantDb; dbCalls: () => number } {
	let callCount = 0;
	const db = {
		execute: async () => {
			callCount += 1;
			return { rows: subtreeIds.map((id) => ({ id })) };
		},
		select: () => {
			callCount += 1;
			const chain = {
				from: () => chain,
				where: () => chain,
				orderBy: () => chain,
				limit: () => chain,
				offset: async () => rows,
			};
			return chain;
		},
	} as unknown as TenantDb;
	return { db, dbCalls: () => callCount };
}

describe("listExpenses — subtree scope expansion", () => {
	it("throws FORBIDDEN (BranchAccessDeniedError) for an out-of-scope scope id, before any DB access", async () => {
		const { db, dbCalls } = fakeDb([]);
		await expect(
			listExpenses(db, {
				branchId: BRANCH_OUTSIDE,
				accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
		// Guard fires before the subtree CTE OR the listing query runs.
		expect(dbCalls()).toBe(0);
	});

	it("expands a non-leaf scope node to its subtree (hits the CTE, then lists rows)", async () => {
		// REGION expands to its branch descendants; intersected with the ceiling.
		const { db, dbCalls } = fakeDb([REGION, BRANCH_A, BRANCH_B], []);
		const result = await listExpenses(db, {
			branchId: REGION,
			accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
		});
		expect(result).toEqual([]);
		// Both the subtree CTE and the listing query were consulted.
		expect(dbCalls()).toBe(2);
	});

	it("accepts an in-scope leaf branch", async () => {
		const { db } = fakeDb([BRANCH_A], []);
		const result = await listExpenses(db, {
			branchId: BRANCH_A,
			accessibleNodeIds: [REGION, BRANCH_A, BRANCH_B],
		});
		expect(result).toEqual([]);
	});

	it("applies no scope CTE when no branchId is supplied (org-wide / ceiling only)", async () => {
		// No scopeNodeId → resolveScopeNodeIds returns the ceiling verbatim with
		// NO DB hit; the only DB call is the listing query itself.
		const { db, dbCalls } = fakeDb([], []);
		const result = await listExpenses(db, {
			accessibleNodeIds: [REGION, BRANCH_A],
		});
		expect(result).toEqual([]);
		expect(dbCalls()).toBe(1);
	});
});
