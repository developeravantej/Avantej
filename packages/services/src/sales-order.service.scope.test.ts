/**
 * Sales Order service — hierarchy scope (subtree expansion) tests.
 *
 * Covers the equality→subtree conversion on the four read procs:
 *   listSalesOrders, getSalesOrderKpiSummary, getLargestSaleToday,
 *   getLatestCompletedSalesOrder.
 *
 * Two properties are pinned here, both WITHOUT a live DB:
 *
 *  1. Out-of-scope guard short-circuits BEFORE any query. A branchId that is
 *     not in accessibleNodeIds must never reach the database — listSalesOrders
 *     throws FORBIDDEN; the read-preview procs return their empty value (null /
 *     zero). The fake DB throws on any access, so reaching it fails the test.
 *
 *  2. An in-scope non-leaf scope triggers SUBTREE expansion. resolveScopeNodeIds
 *     runs the recursive-CTE (`tenantDb.execute`) to expand the picked node to
 *     its descendants — the old `eq(branchId)` path never did. We assert the
 *     expansion ran (execute called) for each proc. Row-level correctness needs
 *     a live DB and is left to integration coverage.
 *
 * Run: bun test src/sales-order.service.scope.test.ts
 */

import { describe, expect, it } from "bun:test";
import {
	getLargestSaleToday,
	getLatestCompletedSalesOrder,
	getSalesOrderKpiSummary,
	listSalesOrders,
} from "./sales-order.service";

const REGION = "11111111-1111-4111-8111-111111111111";
const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_OUTSIDE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

type FakeDb = Parameters<typeof listSalesOrders>[0];

/**
 * A DB that throws on any access — proves the guard short-circuits before any
 * query (no execute, no select) on the out-of-scope path.
 */
function throwingDb(): FakeDb {
	const boom = (): never => {
		throw new Error("DB_TOUCHED: out-of-scope must not reach the database");
	};
	return {
		execute: boom,
		select: boom,
		query: new Proxy({}, { get: () => boom }),
	} as unknown as FakeDb;
}

/**
 * A DB whose `execute` returns the supplied subtree ids (mirrors
 * getDescendantNodeIds' `{ rows: [{ id }] }` shape) and whose query builder
 * yields empty result sets. Records how many times `execute` ran so a test can
 * assert that subtree expansion actually fired.
 */
function subtreeDb(ids: string[]): { db: FakeDb; executeCalls: () => number } {
	let executeCalls = 0;
	// biome-ignore lint/suspicious/noExplicitAny: minimal chainable test stub
	const chain: any = {};
	for (const m of [
		"select",
		"from",
		"leftJoin",
		"innerJoin",
		"orderBy",
		"limit",
		"offset",
	]) {
		chain[m] = () => chain;
	}
	chain.where = () => chain;
	// Awaiting any builder resolves to an empty result set.
	chain.then = (resolve: (v: unknown) => void) => resolve([]);
	const db = {
		execute: async () => {
			executeCalls += 1;
			return { rows: ids.map((id) => ({ id })) };
		},
		select: () => chain,
	} as unknown as FakeDb;
	return { db, executeCalls: () => executeCalls };
}

describe("sales-order scope — out-of-scope branch never reaches the DB", () => {
	const accessible = [BRANCH_A, BRANCH_B]; // non-empty ceiling, excludes OUTSIDE

	it("listSalesOrders throws FORBIDDEN for an out-of-scope branchId", async () => {
		await expect(
			listSalesOrders(throwingDb(), {
				branchId: BRANCH_OUTSIDE,
				accessibleNodeIds: accessible,
			}),
		).rejects.toThrow(/FORBIDDEN/);
	});

	it("getSalesOrderKpiSummary returns zeros (no leak) for an out-of-scope branchId", async () => {
		const result = await getSalesOrderKpiSummary(throwingDb(), {
			branchId: BRANCH_OUTSIDE,
			accessibleNodeIds: accessible,
		});
		expect(result.totalSalesCents).toBe(0);
		expect(result.salesCount).toBe(0);
		expect(result.confirmedCount).toBe(0);
	});

	it("getLargestSaleToday returns null for an out-of-scope branchId", async () => {
		const result = await getLargestSaleToday(throwingDb(), {
			branchId: BRANCH_OUTSIDE,
			accessibleNodeIds: accessible,
		});
		expect(result).toBeNull();
	});

	it("getLatestCompletedSalesOrder returns null for an out-of-scope branchId", async () => {
		const result = await getLatestCompletedSalesOrder(throwingDb(), {
			branchId: BRANCH_OUTSIDE,
			accessibleNodeIds: accessible,
		});
		expect(result).toBeNull();
	});
});

describe("sales-order scope — in-scope non-leaf node expands to its subtree", () => {
	const accessible = [REGION, BRANCH_A, BRANCH_B];
	const subtree = [REGION, BRANCH_A, BRANCH_B];

	it("listSalesOrders expands the region scope (recursive CTE runs)", async () => {
		const { db, executeCalls } = subtreeDb(subtree);
		const result = await listSalesOrders(db, {
			branchId: REGION,
			accessibleNodeIds: accessible,
		});
		expect(result).toEqual({ rows: [], total: 0 });
		// Subtree expansion fired — the old eq(branchId) path never hit execute.
		expect(executeCalls()).toBe(1);
	});

	it("getSalesOrderKpiSummary expands the region scope (recursive CTE runs)", async () => {
		const { db, executeCalls } = subtreeDb(subtree);
		const result = await getSalesOrderKpiSummary(db, {
			branchId: REGION,
			accessibleNodeIds: accessible,
		});
		expect(result.totalSalesCents).toBe(0);
		expect(executeCalls()).toBe(1);
	});

	it("getLargestSaleToday expands the region scope (recursive CTE runs)", async () => {
		const { db, executeCalls } = subtreeDb(subtree);
		const result = await getLargestSaleToday(db, {
			branchId: REGION,
			accessibleNodeIds: accessible,
		});
		expect(result).toBeNull();
		expect(executeCalls()).toBe(1);
	});

	it("getLatestCompletedSalesOrder expands the region scope (recursive CTE runs)", async () => {
		const { db, executeCalls } = subtreeDb(subtree);
		const result = await getLatestCompletedSalesOrder(db, {
			branchId: REGION,
			accessibleNodeIds: accessible,
		});
		expect(result).toBeNull();
		expect(executeCalls()).toBe(1);
	});
});
