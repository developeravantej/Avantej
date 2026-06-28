/**
 * Scope-expansion guard tests for the commission-splits read paths.
 *
 * `liabilityByStaff` and `listCommissionLedger` now expand the `branchId`
 * input through `resolveScopeNodeIds`, so a non-leaf scope node (country /
 * region / state) matches its branches' rows instead of zero. As a side
 * effect, the shared scope guard (`assertBranchAccessible`, invoked inside
 * `resolveScopeNodeIds`) rejects an out-of-scope id with a FORBIDDEN-mapped
 * `BranchAccessDeniedError` BEFORE any database query runs.
 *
 * These tests assert that fail-closed behaviour without a live DB: the tenant
 * DB stub throws if any query method is touched, so the only way the call can
 * reject with `BranchAccessDeniedError` is for the guard to fire first.
 *
 * Row-correctness (a non-leaf scope returning the union of its descendant
 * branches' rows) requires a live tenant DB to exercise the recursive-CTE
 * subtree expansion in `getDescendantNodeIds`; it is covered by the
 * integration suite and intentionally skipped here.
 */

import { describe, expect, it } from "bun:test";
import {
	liabilityByStaff,
	listCommissionLedger,
} from "./commission-splits.service";
import { BranchAccessDeniedError } from "./hierarchy-scope";

const BRANCH_IN_SCOPE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REGION_OUT_OF_SCOPE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

// A tenant DB that explodes on ANY property access. The scope guard must fire
// before the service touches the database, so a correctly fail-closed call
// never reads from this object. If the guard were missing, the service would
// reach a query method and surface THIS error instead of
// BranchAccessDeniedError — making the assertion below fail loudly.
const dbMustNotBeQueried = new Proxy(
	{},
	{
		get() {
			throw new Error(
				"tenant DB was queried before the scope guard fired (fail-open leak)",
			);
		},
	},
) as never;

const controlPanelStub = {} as never;

describe("liabilityByStaff — scope guard", () => {
	it("rejects an out-of-scope branchId with FORBIDDEN before any DB query", async () => {
		await expect(
			liabilityByStaff(dbMustNotBeQueried, controlPanelStub, {
				branchId: REGION_OUT_OF_SCOPE,
				accessibleNodeIds: [BRANCH_IN_SCOPE],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
	});
});

describe("listCommissionLedger — scope guard", () => {
	it("rejects an out-of-scope branchId with FORBIDDEN before any DB query", async () => {
		await expect(
			listCommissionLedger(dbMustNotBeQueried, controlPanelStub, {
				branchId: REGION_OUT_OF_SCOPE,
				accessibleNodeIds: [BRANCH_IN_SCOPE],
			}),
		).rejects.toThrow(BranchAccessDeniedError);
	});
});
