/**
 * Category Commission Router — tenant-isolation unit tests.
 *
 * getByCategory / upsert / delete resolve the service_categories row for
 * input.categoryId and call guardStoredBranchForContext(context, category.branchId).
 * A category pinned to a branch outside the caller's accessibleNodeIds must be
 * rejected with FORBIDDEN; an org-wide (branchId=null) or in-scope category passes.
 *
 * Permission fast-path: when `roles.findFirst` returns undefined the permission
 * service falls back to `member.role === "admin"` → always passes (mock-context
 * defaults to an admin member), so the branch guard is what gates these tests.
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { categoryCommissionRouter } from "./category-commission";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const IN_SCOPE_BRANCH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OUT_OF_SCOPE_BRANCH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const TRAINER_TIER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

// Valid upsert input: slot weightages must sum to 10000 bps (router invariant).
const validUpsertInput = {
	organizationId: ORG_ID,
	categoryId: CATEGORY_ID,
	paymentType: "fixed" as const,
	isConditional: false,
	maxCoaches: 1,
	slots: [{ slotIndex: 0, label: "Lead", weightageBasisPoints: 10000 }],
	rates: [{ trainerTierId: TRAINER_TIER_ID, amount: 5000 }],
};

/**
 * Build a working transaction stub. The upsert/delete services run their writes
 * inside `tenantDb.transaction(cb)` and call `tx.delete/insert/update/select`. A
 * bare `{}` tx makes the in-scope path blow up with "tx.delete is not a function",
 * which would make the out-of-scope FORBIDDEN cases pass for the WRONG reason
 * (an unrelated mock throw whose code !== FORBIDDEN). Providing a functioning tx
 * lets the in-scope path RESOLVE cleanly, so the out-of-scope RED is genuinely
 * "resolved instead of rejecting" via the branch guard — isolating the guard.
 *
 * Each builder method returns a real Promise (resolving to a row array) with the
 * chainable methods attached as own-properties, so both `await tx.delete(t).where(c)`
 * (upsert) and `tx.delete(t).where(c).returning()` (delete) work without a custom
 * thenable. Config insert resolves to `[{ id }]` so the service's truthy config
 * check passes; everything else resolves to `[]`.
 */
function makeTx() {
	// A Promise<row[]> carrying chainable query-builder methods as own properties.
	type ChainNode = Promise<unknown[]> & {
		values: () => ChainNode;
		set: () => ChainNode;
		where: () => ChainNode;
		orderBy: () => ChainNode;
		returning: () => ChainNode;
		from: () => ChainNode;
	};
	const node = (rows: unknown[]): ChainNode => {
		const p = Promise.resolve(rows) as ChainNode;
		// Config insert/delete must resolve to a non-empty row so the service's
		// "insert returned no row" / "No commission config found" guards pass.
		const filled = () => node([{ id: "config-test-1" }]);
		p.values = mock(filled);
		p.set = mock(() => node(rows));
		p.where = mock(() => node(rows));
		p.orderBy = mock(() => node(rows));
		p.returning = mock(filled);
		p.from = mock(() => node(rows));
		return p;
	};
	return {
		insert: mock(() => node([])),
		update: mock(() => node([])),
		delete: mock(() => node([{ id: "config-test-1" }])),
		select: mock(() => node([])),
	};
}

/**
 * Admin-role DB (roles.findFirst → undefined → permission fast-path passes).
 * `serviceCategories.findFirst` returns the category-under-test so the new
 * guardStoredBranchForContext call has a branchId to evaluate.
 */
function makeAdminDb(category: { id: string; branchId: string | null }) {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			serviceCategories: {
				findFirst: mock(() => Promise.resolve(category)),
			},
			categoryCommissionConfigs: {
				findFirst: mock(() => Promise.resolve(null)),
			},
		},
		insert: mock(() => ({
			values: mock(() => ({ returning: mock(() => Promise.resolve([])) })),
		})),
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => ({ returning: mock(() => Promise.resolve([])) })),
			})),
		})),
		delete: mock(() => ({
			where: mock(() => ({ returning: mock(() => Promise.resolve([])) })),
		})),
		select: mock(() => ({
			from: mock(() => ({ where: mock(() => Promise.resolve([])) })),
		})),
		transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) =>
			cb(makeTx()),
		),
	} as unknown as never;
}

// ─── getByCategory ─────────────────────────────────────────────────────────────

describe("categoryCommissionRouter.getByCategory — tenant isolation", () => {
	it("throws FORBIDDEN when the category is pinned to an out-of-scope branch", async () => {
		const tenantDb = makeAdminDb({
			id: CATEGORY_ID,
			branchId: OUT_OF_SCOPE_BRANCH,
		});
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		await expect(
			call(
				categoryCommissionRouter.getByCategory,
				{ organizationId: ORG_ID, categoryId: CATEGORY_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("passes for an in-scope branch-pinned category", async () => {
		const tenantDb = makeAdminDb({
			id: CATEGORY_ID,
			branchId: IN_SCOPE_BRANCH,
		});
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		await expect(
			call(
				categoryCommissionRouter.getByCategory,
				{ organizationId: ORG_ID, categoryId: CATEGORY_ID },
				{ context: ctx },
			),
		).resolves.toBeDefined();
	});

	it("passes for an org-wide (branchId=null) category regardless of scope", async () => {
		const tenantDb = makeAdminDb({ id: CATEGORY_ID, branchId: null });
		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		await expect(
			call(
				categoryCommissionRouter.getByCategory,
				{ organizationId: ORG_ID, categoryId: CATEGORY_ID },
				{ context: ctx },
			),
		).resolves.toBeDefined();
	});
});

// ─── upsert ────────────────────────────────────────────────────────────────────

describe("categoryCommissionRouter.upsert — tenant isolation", () => {
	it("throws FORBIDDEN when the category is pinned to an out-of-scope branch", async () => {
		const tenantDb = makeAdminDb({
			id: CATEGORY_ID,
			branchId: OUT_OF_SCOPE_BRANCH,
		});
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		await expect(
			call(categoryCommissionRouter.upsert, validUpsertInput, {
				context: ctx,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("resolves for an in-scope branch-pinned category", async () => {
		const tenantDb = makeAdminDb({
			id: CATEGORY_ID,
			branchId: IN_SCOPE_BRANCH,
		});
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		// The branch guard must pass AND the (working-tx-backed) service write must
		// complete — a positive assertion that fires by design, not incidentally.
		await expect(
			call(categoryCommissionRouter.upsert, validUpsertInput, {
				context: ctx,
			}),
		).resolves.toBeDefined();
	});
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("categoryCommissionRouter.delete — tenant isolation", () => {
	it("throws FORBIDDEN when the category is pinned to an out-of-scope branch", async () => {
		const tenantDb = makeAdminDb({
			id: CATEGORY_ID,
			branchId: OUT_OF_SCOPE_BRANCH,
		});
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		await expect(
			call(
				categoryCommissionRouter.delete,
				{ organizationId: ORG_ID, categoryId: CATEGORY_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("resolves for an org-wide (branchId=null) category", async () => {
		const tenantDb = makeAdminDb({ id: CATEGORY_ID, branchId: null });
		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		// Org-wide category bypasses the branch guard; the (working-tx-backed)
		// delete then completes — a positive assertion that fires by design.
		await expect(
			call(
				categoryCommissionRouter.delete,
				{
					organizationId: ORG_ID,
					categoryId: CATEGORY_ID,
				},
				{ context: ctx },
			),
		).resolves.toBeDefined();
	});
});
