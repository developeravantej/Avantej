# Phase 0 — Scope-Guard Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 17 confirmed cross-branch read leaks in the tenant API so that the active hierarchy scope can safely become user-controlled (the scope switcher prerequisite).

**Architecture:** Each leaky read procedure loads a branch-scoped record (or takes a branch/scope input) and must enforce that branch against the caller's `accessibleNodeIds` before returning data. The guards already exist in `packages/api/src/guards.ts`; the fix is to call them on the paths that currently skip them. Every fix is TDD: a failing isolation test first (out-of-scope branch → `FORBIDDEN`/`NOT_FOUND`), then the minimal guard call, then green, then commit.

**Tech Stack:** oRPC procedures (`packages/api`), Drizzle (tenant schema), `bun:test` + `@orpc/server` `call()` + `createMockContext`, hierarchy RBAC via `accessibleNodeIds`.

---

## Source

Derived from the design spec `docs/superpowers/specs/2026-06-25-tenant-scope-switcher-design.md` (§5) and the `scope-guard-coverage-audit` workflow (run `wf_f91ce6eb-0e0`). 94 scoped reads audited; 17 confirmed leaks across 12 router groups.

## Guard patterns (read once before starting)

Three repeatable patterns cover every task. All live in `packages/api/src/guards.ts`:

1. **Stored record branch** — `await guardStoredBranchForContext(context, record.branchId)` after loading a row. `null`/`""`/`undefined` = legitimate org-wide record (allowed); a pinned branch outside `accessibleNodeIds` → `FORBIDDEN`. Use for `order.branchId`, `refund.branchId`, `appointment.branchId`, `service.branchId`, `category.branchId`.
2. **Input branch** — `await guardInputBranchForContext(context, input.branchId)` before using a caller-supplied branch id. `null`/`""` → `FORBIDDEN` (bypass attempt); `undefined` → no-op; out-of-scope → `FORBIDDEN`. Use for `members.newToday`'s `input.branchId`.
3. **Set/derived scope** — for procedures that aggregate by a scope id or staff set (payouts, commission liability), validate each id (`guardBranchAccessible` / resolve staff → `hierarchyScopeId`) and thread `accessibleNodeIds` into the service so an omitted scope does not silently return org-wide.

**Invariant (CI-enforced by `check-tenant-perimeter.mjs`):** never pass a `record.branchId` to `guardInputBranchForContext` — use `guardStoredBranchForContext` for stored values, `guardInputBranchForContext` for input values. When you call a guard, import it from `"../guards"` (top-level router file) or `"../../guards"` (split-folder router).

**Test convention:** mock `context.accessibleNodeIds` non-empty containing an in-scope branch; mock the loaded record's `branchId` to an out-of-scope uuid → assert `call(...)` rejects `{ code: "FORBIDDEN" }`; a second case with an in-scope branch (or admin/empty `accessibleNodeIds`) still passes. Run one file: `cd packages/api && bun test src/routers/<path>.test.ts`.

## Task ordering

High-severity first (Tasks 1–5), then medium (Tasks 6–12). Each task is independently committable. `salesOrders.getById` + `salesOrders.statusHistory` are fixed together (Task 1).

---

### Task 1: salesOrders.getById + salesOrders.statusHistory — packages/api/src/routers/sales-orders/query.procedures.ts
**Files:**
- Modify: `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/packages/api/src/routers/sales-orders/query.procedures.ts` — import block at lines 14-18; `getById` handler after line 141; `statusHistory` handler after line 177
- Test: `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/packages/api/src/routers/sales-orders/query.procedures.test.ts` (NEW FILE — no sales-orders test exists; modeled on the sibling `packages/api/src/routers/refunds.router.test.ts` conventions: `bun:test` + `@orpc/server` `call` + `createMockContext` from `../../test-utils/mock-context`, admin-fast-path db stub, literal v4 UUID constants)

- [ ] **Step 1: Write the failing test** (full test code in a ```ts block — real mock setup grounded in `refunds.router.test.ts` patterns)

Create `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/packages/api/src/routers/sales-orders/query.procedures.test.ts`:

```ts
/**
 * Sales Orders query procedures — tenant-isolation guard tests.
 *
 * Both getById and statusHistory load the sales order and must reject when the
 * order's branchId is outside the caller's accessibleNodeIds (cross-branch read
 * leak). An in-scope branch must still pass. Permission uses the admin fast-path
 * (roles.findFirst → undefined + member.role === "admin").
 *
 * NOTE: depth is ../../ here because this file lives in routers/sales-orders/.
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { salesOrdersRouter } from "./index";
import { createMockContext } from "../../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SALES_ORDER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IN_SCOPE_BRANCH = "11111111-1111-4111-8111-111111111111";
const OUT_OF_SCOPE_BRANCH = "99999999-9999-4999-8999-999999999999";

function makeOrder(branchId: string | null) {
	return {
		id: SALES_ORDER_ID,
		salesOrderNumber: "SO-0001",
		date: new Date(),
		customerId: null,
		customerName: "Walk-in",
		createdBy: null,
		branchId,
		status: "completed",
		totalAmount: 30000,
		cancelledAmount: 0,
		notes: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

/**
 * Admin-fast-path tenantDb: roles.findFirst → undefined so requirePermission
 * grants on member.role === "admin". salesOrders.findFirst returns the order
 * (drives getById and the statusHistory parent-order load). select() chain
 * resolves to [] (statusHistory rows — empty page is fine for the guard test).
 */
function makeAdminDb(order: ReturnType<typeof makeOrder>) {
	const selectChain = {
		from: mock(() => selectChain),
		where: mock(() => selectChain),
		orderBy: mock(() => selectChain),
		limit: mock(() => selectChain),
		leftJoin: mock(() => selectChain),
		then: (resolve: (v: unknown) => unknown) =>
			Promise.resolve([]).then(resolve),
	};
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			salesOrders: { findFirst: mock(() => Promise.resolve(order)) },
		},
		select: mock(() => selectChain),
	} as unknown as never;
}

// ─── getById ───────────────────────────────────────────────────────────────

describe("salesOrdersRouter.getById — branch isolation", () => {
	const input = { organizationId: ORG_ID, id: SALES_ORDER_ID };

	it("rejects FORBIDDEN when the order's branch is outside accessibleNodeIds", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(makeOrder(OUT_OF_SCOPE_BRANCH)),
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		await expect(
			call(salesOrdersRouter.getById, input, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("passes when the order's branch is in accessibleNodeIds", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(makeOrder(IN_SCOPE_BRANCH)),
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		const result = await call(salesOrdersRouter.getById, input, {
			context: ctx,
		});
		expect(result).toMatchObject({ id: SALES_ORDER_ID });
	});
});

// ─── statusHistory ───────────────────────────────────────────────────────────

describe("salesOrdersRouter.statusHistory — branch isolation", () => {
	const input = { organizationId: ORG_ID, salesOrderId: SALES_ORDER_ID };

	it("rejects FORBIDDEN when the order's branch is outside accessibleNodeIds", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(makeOrder(OUT_OF_SCOPE_BRANCH)),
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		await expect(
			call(salesOrdersRouter.statusHistory, input, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("passes (returns rows page) when the order's branch is in accessibleNodeIds", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(makeOrder(IN_SCOPE_BRANCH)),
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		const result = await call(salesOrdersRouter.statusHistory, input, {
			context: ctx,
		});
		expect(result).toMatchObject({ nextCursor: null });
		expect(Array.isArray(result.rows)).toBe(true);
	});
});
```

- [ ] **Step 2: Run test, verify FAIL** (exact command + expected failure reason)

```bash
cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/packages/api && bun test src/routers/sales-orders/query.procedures.test.ts
```

Expected: both "rejects FORBIDDEN" cases FAIL. Before the fix, neither `getById` nor `statusHistory` guards `order.branchId`, so the out-of-scope order is returned normally instead of throwing — the `.rejects.toMatchObject({ code: "FORBIDDEN" })` assertions fail ("promise resolved instead of rejecting"). The two in-scope "passes" cases already pass.

- [ ] **Step 3: Add the guard** (exact edits)

**Edit 3a — add `guardStoredBranchForContext` to the import block.** Current lines 14-18:

```ts
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../../guards";
```

Replace with:

```ts
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
	guardStoredBranchForContext,
} from "../../guards";
```

**Edit 3b — guard the loaded order in `getById`.** The order is loaded and null-checked at lines 136-141. Insert the guard immediately after the null check (after line 141, before line 143 `let createdByName`). Surrounding context:

```ts
		const order = await getSalesOrderById(context.tenantDb, input.id);
		if (!order) {
			throw new ORPCError("NOT_FOUND", {
				message: `Sales order not found: ${input.id}`,
			});
		}

		// Tenant isolation: a record pinned to a branch outside the caller's
		// accessible scope must not be readable cross-branch.
		await guardStoredBranchForContext(context, order.branchId);

		let createdByName: string | null = null;
```

**Edit 3c — guard the parent order in `statusHistory`.** The handler currently goes straight from the permission check (lines 172-177) to the history load (line 179 `const limit`). The status-history rows carry no `branchId`, so load the parent order and guard it first. Insert between line 177 (close of `requirePermissionOrpc(...)`) and line 179. Surrounding context:

```ts
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			// Tenant isolation: load the parent order and verify its branch is in
			// scope before exposing its status history.
			const order = await getSalesOrderById(
				context.tenantDb,
				input.salesOrderId,
			);
			if (!order) {
				throw new ORPCError("NOT_FOUND", {
					message: `Sales order not found: ${input.salesOrderId}`,
				});
			}
			await guardStoredBranchForContext(context, order.branchId);

			const limit = input.limit;
```

(`getSalesOrderById` and `ORPCError` are already imported in this file — lines 22 and 8 respectively — so no further import edits are needed for Edit 3c.)

- [ ] **Step 4: Run test, verify PASS** (exact command)

```bash
cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/packages/api && bun test src/routers/sales-orders/query.procedures.test.ts
```

Expected: all 4 tests pass. Optionally confirm no regressions across sibling sales/refund tests and types:

```bash
cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/packages/api && bun test src/routers/refunds.router.test.ts && bun check-types
```

- [ ] **Step 5: Commit** (git add + conventional commit message)

```bash
cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14 && \
git add packages/api/src/routers/sales-orders/query.procedures.ts packages/api/src/routers/sales-orders/query.procedures.test.ts && \
git commit -m "fix(sales-orders): enforce branch scope on getById + statusHistory reads

guardStoredBranchForContext now runs on the loaded order in salesOrders.getById
and on the parent order in salesOrders.statusHistory, closing a cross-branch
read leak where a caller could fetch an order (and its status history) pinned to
a branch outside their accessibleNodeIds. Adds query.procedures.test.ts covering
out-of-scope FORBIDDEN and in-scope pass for both procedures.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: payouts.previewBatch + runBatch + processForRecipient — packages/api/src/routers/payouts/batch.procedures.ts
**Files:**
- Modify: `packages/api/src/routers/payouts/batch.procedures.ts:40-44` (previewBatch handler), `:87-91` (runBatch handler), `:153-157` (processForRecipient handler), and the imports block `:7-21`
- Test: `packages/api/src/routers/payouts.router.test.ts` (append new `describe` blocks — file exists)

- [ ] **Step 1: Write the failing test**

Append these blocks to the END of `packages/api/src/routers/payouts.router.test.ts` (after line 159). They reuse the file's existing imports (`describe, expect, it, mock`, `call`, `payoutsRouter`, `createMockContext`) and constants (`ORG_ID`). The new `makeStaffScopeDb()` adds a chainable `select().from().where().limit()` resolving the staff member's `hierarchyScopeId`, on top of the role-miss `query` shape that `requirePermissionOrpc` reads. Out-of-scope staff are tested with a **non-admin** member (so the new guard runs and the existing admin-bypass doesn't mask it); the positive control uses the default admin member (bypass) to confirm the procedure still reaches the service.

```ts
// ── Tenant-isolation: batch procedures must reject out-of-scope staffIds ──────
//
// previewBatch / runBatch / processForRecipient accept a list of staff
// (control-panel user IDs) or a single recipientId. For a non-admin caller,
// every targeted staff member's hierarchyScopeId must be inside
// context.accessibleNodeIds — otherwise a scoped manager could pay out (or
// preview) commissions for staff in a branch they cannot access. Mirrors the
// recipientSummary non-admin guard.

const STAFF_USER_IN = "11111111-1111-4111-8111-111111111111"; // control-panel user id, in scope
const STAFF_USER_OUT = "22222222-2222-4222-8222-222222222222"; // control-panel user id, out of scope
const NODE_IN = "node-root"; // default accessibleNodeIds entry
const NODE_OUT = "33333333-3333-4333-8333-333333333333"; // not in accessibleNodeIds

const NON_ADMIN_MEMBER = {
	id: "member-mgr",
	userId: "user-mgr",
	role: "manager" as const,
	status: "active" as const,
	hierarchyScopeId: NODE_IN,
	roleId: null,
};

/**
 * makeGuardDb() + a chainable select() that resolves a staff user id to its
 * member.hierarchyScopeId. `scopeByUser` maps userId → hierarchyScopeId; a
 * miss resolves to [] (no member row), which the guard must also reject.
 */
function makeStaffScopeDb(scopeByUser: Record<string, string>) {
	const base = makeGuardDb() as unknown as Record<string, unknown>;
	// The guard issues: select({hierarchyScopeId}).from(members).where(eq(userId,id)).limit(1)
	let pendingUserId: string | undefined;
	const builder = {
		from: () => builder,
		where: (cond: unknown) => {
			// the test extracts the bound user id from the eq() condition
			const bound = (cond as { queryChunks?: unknown })?.toString?.() ?? "";
			void bound;
			return builder;
		},
		limit: () =>
			Promise.resolve(
				pendingUserId && scopeByUser[pendingUserId]
					? [{ hierarchyScopeId: scopeByUser[pendingUserId] }]
					: [],
			),
	};
	base.select = () => builder;
	// guard resolves ids one at a time; capture each via a thin wrapper
	base.__setUser = (id: string) => {
		pendingUserId = id;
	};
	return base as unknown as never;
}

describe("payouts batch — non-admin out-of-scope staff guard", () => {
	it("previewBatch rejects a staffId whose member is outside accessibleNodeIds", async () => {
		await expect(
			call(
				payoutsRouter.previewBatch,
				{
					organizationId: ORG_ID,
					staffIds: [STAFF_USER_OUT],
					periodStart: new Date("2026-06-01"),
					periodEnd: new Date("2026-06-30"),
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({ [STAFF_USER_OUT]: NODE_OUT }),
						member: NON_ADMIN_MEMBER,
						accessibleNodeIds: [NODE_IN],
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("runBatch rejects a staffId whose member is outside accessibleNodeIds", async () => {
		await expect(
			call(
				payoutsRouter.runBatch,
				{
					organizationId: ORG_ID,
					staffIds: [STAFF_USER_OUT],
					periodStart: new Date("2026-06-01"),
					periodEnd: new Date("2026-06-30"),
					paymentMethod: "bank_transfer" as const,
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({ [STAFF_USER_OUT]: NODE_OUT }),
						member: NON_ADMIN_MEMBER,
						accessibleNodeIds: [NODE_IN],
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("processForRecipient rejects a recipientId whose member is outside accessibleNodeIds", async () => {
		await expect(
			call(
				payoutsRouter.processForRecipient,
				{
					organizationId: ORG_ID,
					recipientId: STAFF_USER_OUT,
					paymentMethod: "bank_transfer" as const,
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({ [STAFF_USER_OUT]: NODE_OUT }),
						member: NON_ADMIN_MEMBER,
						accessibleNodeIds: [NODE_IN],
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("previewBatch rejects a staffId with no member row (enumeration guard)", async () => {
		await expect(
			call(
				payoutsRouter.previewBatch,
				{
					organizationId: ORG_ID,
					staffIds: [STAFF_USER_OUT],
					periodStart: new Date("2026-06-01"),
					periodEnd: new Date("2026-06-30"),
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({}), // no mapping → [] → reject
						member: NON_ADMIN_MEMBER,
						accessibleNodeIds: [NODE_IN],
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("payouts batch — positive control (in-scope + admin bypass)", () => {
	// Admin bypasses the scope walk and reaches the service (BAD_REQUEST here).
	it("previewBatch reaches the service for an in-scope staffId (non-admin)", async () => {
		await expect(
			call(
				payoutsRouter.previewBatch,
				{
					organizationId: ORG_ID,
					staffIds: [STAFF_USER_IN],
					periodStart: new Date("2026-06-01"),
					periodEnd: new Date("2026-06-30"),
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({ [STAFF_USER_IN]: NODE_IN }),
						member: NON_ADMIN_MEMBER,
						accessibleNodeIds: [NODE_IN],
					}),
				},
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("runBatch reaches the service for an admin (scope walk bypassed)", async () => {
		await expect(
			call(
				payoutsRouter.runBatch,
				{
					organizationId: ORG_ID,
					staffIds: [STAFF_USER_OUT],
					periodStart: new Date("2026-06-01"),
					periodEnd: new Date("2026-06-30"),
					paymentMethod: "bank_transfer" as const,
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({}), // admin → never queried
						// default member = admin
					}),
				},
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
```

> Implementation note for Step 3: the guard must resolve each staff id with a `members` `select`. Because the mock builder above captures the id via `__setUser`, the implementation must call `tenantDb.__setUser?.(id)` is NOT acceptable — instead the implementation resolves all ids in ONE `inArray` query (preferred; see Step 3), and the mock's `where`/`limit` returns the mapped rows. **Adjust the mock to the chosen query shape**: if the implementation uses a single `inArray(members.userId, staffIds)` returning all scoped rows, replace `makeStaffScopeDb`'s `limit` resolver with a `where`-aware resolver that returns `Object.entries(scopeByUser).map(([userId, hierarchyScopeId]) => ({ userId, hierarchyScopeId }))` and have the guard compare each requested id. Keep one consistent shape between Step 1 and Step 3.

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd packages/api && bun test src/routers/payouts.router.test.ts
```

Expected failure: the four "rejects … outside accessibleNodeIds / no member row" tests FAIL — the procedures do not query `members` for staff scope, so the call falls through to the service and rejects with `BAD_REQUEST` (from `makeGuardDb().transaction`) instead of `FORBIDDEN`. (The `if (input.branchId)` guard is dead here — no `branchId` is in the input.) The positive-control tests already pass.

- [ ] **Step 3: Add the guard**

First extend the imports block at `packages/api/src/routers/payouts/batch.procedures.ts:7-21` to pull in the schema + drizzle helpers (none are imported today):

```ts
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { members } from "@avantej-core/db/schema/tenant/members";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../../guards";
```

Then add a shared helper near the top of the file (after the imports, before `export const payoutsBatchProcedures`):

```ts
/**
 * Non-admin tenant isolation: every targeted staff (control-panel user id)
 * must resolve to a member whose hierarchyScopeId is inside the caller's
 * accessibleNodeIds. Mirrors the recipientSummary guard. Admins bypass.
 * Any staff id with no member row, or one outside scope, → FORBIDDEN.
 */
async function assertStaffWithinScope(
	context: { tenantDb: typeof members.$inferSelect extends never ? never : any; member: { role: string }; accessibleNodeIds?: string[] },
	staffUserIds: string[],
): Promise<void> {
	if (context.member.role === "admin" || !context.accessibleNodeIds?.length) {
		return;
	}
	const rows = await context.tenantDb
		.select({
			userId: members.userId,
			hierarchyScopeId: members.hierarchyScopeId,
		})
		.from(members)
		.where(inArray(members.userId, staffUserIds));

	const scopeByUser = new Map<string, string>(
		rows.map((r: { userId: string; hierarchyScopeId: string }) => [
			r.userId,
			r.hierarchyScopeId,
		]),
	);
	for (const id of staffUserIds) {
		const scope = scopeByUser.get(id);
		if (!scope || !context.accessibleNodeIds.includes(scope)) {
			throw new ORPCError("FORBIDDEN", {
				message: "Staff member is not within your accessible scope",
			});
		}
	}
}
```

(If `any` in the helper signature trips oxlint, type `context` as the procedure `context` type or `Context` from `../../context` — match whatever the sibling `read.procedures.ts` does; it inlines the check rather than extracting, so inlining `assertStaffWithinScope`'s body into each handler is also acceptable and avoids the typing question.)

Then call it inside each handler, immediately AFTER the existing `if (input.branchId)` guard block and BEFORE `requirePermissionOrpc`.

previewBatch — insert at line 44/45 boundary:
```ts
		assertOrgContextMatch(context, input);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
		await assertStaffWithinScope(context, input.staffIds);   // ← ADD
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_payout",
			"read",
		);
```

runBatch — insert at line 91/92 boundary:
```ts
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
		await assertStaffWithinScope(context, input.staffIds);   // ← ADD
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_payout",
			"process",
		);
```

processForRecipient — insert at line 157/158 boundary (single recipient id wrapped in an array):
```ts
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
		await assertStaffWithinScope(context, [input.recipientId]);   // ← ADD
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_payout",
			"process",
		);
```

Notes for the implementer:
- `staffIds` and `recipientId` are control-panel **user IDs** matched against `members.userId` (confirmed: `recipientSummary` at `read.procedures.ts:208` does `eq(members.userId, input.recipientId)`, and `previewBatch` service filters `commissionSplits.staffId` which equals the same staff user id). Resolve against `members.userId`, not `members.id`.
- Do NOT pass any `branchId` to `guardInputBranchForContext`/`guardStoredBranchForContext` — this fix guards by resolved member scope, not by a branch column, so the CI perimeter check (`check-tenant-perimeter.mjs`) is unaffected.
- Keep the existing dead `if (input.branchId)` block — it still guards an explicit branch anchor passed by an admin; the new check covers the staff dimension that was previously unguarded.

- [ ] **Step 4: Run test, verify PASS**

```bash
cd packages/api && bun test src/routers/payouts.router.test.ts
```

All cases pass: out-of-scope/no-row staff → `FORBIDDEN`; in-scope non-admin and admin → reach service (`BAD_REQUEST`). Then confirm nothing else regressed and types hold:

```bash
cd packages/api && bun test src/routers/
bun check-types
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/payouts/batch.procedures.ts packages/api/src/routers/payouts.router.test.ts
git commit -m "$(cat <<'EOF'
fix(payouts): enforce per-staff hierarchy scope on batch payout procedures

previewBatch, runBatch and processForRecipient only guarded an optional
input.branchId (dead path — no branchId is sent), so a scoped non-admin
could preview/run payouts for staff in branches outside their
accessibleNodeIds. Resolve each input staff user id to its
members.hierarchyScopeId and reject (FORBIDDEN) any outside scope or with
no member row, mirroring the recipientSummary guard. Admins and callers
with empty accessibleNodeIds bypass.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: commissionSplits.liabilitySummary + exportLiabilityCsv — packages/api/src/routers/commission-splits/analytics.procedures.ts
**Files:**
- Modify: `packages/api/src/routers/commission-splits/analytics.procedures.ts:78-89` (liabilitySummary) and `:223-234` (exportLiabilityCsv)
- Modify (service threading): `packages/services/src/commission-splits.service.ts:1153-1162` (`LiabilitySummaryParams` + its WHERE build) and `:1181` / `:2327` call sites
- Test: `packages/api/src/routers/commission-splits/analytics.procedures.test.ts` (NEW FILE — no commission-splits router test exists; the closest sibling is `packages/api/src/routers/analytics.router.test.ts`, whose service-mock + `call()` FORBIDDEN pattern this mirrors)

- [ ] **Step 1: Write the failing test** (full test code — grounded in `analytics.router.test.ts`'s `mock.module` + `call()` pattern and `mock-context.ts`'s `accessibleNodeIds`/default admin member)

```ts
/**
 * commission-splits analytics — branch-scope guard on hierarchyNodeId.
 *
 * liabilitySummary and exportLiabilityCsv accept an optional hierarchyNodeId.
 * Before the fix, that node was passed straight to the service with no RBAC
 * check, so a caller could read another branch's commission liability by
 * naming a node outside their accessibleNodeIds. The fix mirrors
 * liabilityByStaff: guardBranchAccessible(input.hierarchyNodeId, ...).
 *
 * The default mock member is role:"admin", which bypasses the permission gate
 * (permission.service.ts: `member.role === "admin"`), so these calls reach the
 * branch guard. The service is mocked so the in-scope path resolves cleanly.
 *
 * Run: cd packages/api && bun test src/routers/commission-splits/analytics.procedures.test.ts
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { createMockContext } from "../../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IN_SCOPE_NODE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OUT_OF_SCOPE_NODE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const EMPTY_SUMMARY = {
	trainers: [],
	totals: {
		approvedUnpaidCents: 0,
		paidCents: 0,
		manualAdjustmentCents: 0,
		netPayableCents: 0,
		byRoleType: {},
	},
};

const mockLiabilitySummary = mock(() => Promise.resolve(EMPTY_SUMMARY));
const mockExportLiabilityCsv = mock(() =>
	Promise.resolve({ csv: "", rowCount: 0 }),
);

mock.module("@avantej-core/services/commission-splits.service", () => ({
	liabilitySummary: mockLiabilitySummary,
	liabilityByStaff: mock(() =>
		Promise.resolve({ rows: [], totalCount: 0, hasMore: false }),
	),
	exportLiabilityCsv: mockExportLiabilityCsv,
}));

import { commissionSplitsAnalyticsProcedures } from "./analytics.procedures";

// Role/permission lookups all miss → hasPermission() falls back to the
// `member.role === "admin"` rule (default mock member is admin), so the
// OR-permission gate passes and execution reaches the branch guard.
function makeAdminDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
	} as unknown as never;
}

const VALID_RANGE = {
	from: "2026-01-01T00:00:00.000Z",
	to: "2026-01-31T23:59:59.000Z",
};

describe("commissionSplitsAnalytics.liabilitySummary — hierarchyNodeId branch scope", () => {
	it("rejects a hierarchyNodeId outside accessibleNodeIds with FORBIDDEN", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_NODE],
		});

		await expect(
			call(
				commissionSplitsAnalyticsProcedures.liabilitySummary,
				{
					organizationId: ORG_ID,
					...VALID_RANGE,
					hierarchyNodeId: OUT_OF_SCOPE_NODE,
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockLiabilitySummary).not.toHaveBeenCalled();
	});

	it("delegates to the service when hierarchyNodeId is in scope", async () => {
		mockLiabilitySummary.mockClear();
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_NODE],
		});

		await call(
			commissionSplitsAnalyticsProcedures.liabilitySummary,
			{ organizationId: ORG_ID, ...VALID_RANGE, hierarchyNodeId: IN_SCOPE_NODE },
			{ context: ctx },
		);
		expect(mockLiabilitySummary).toHaveBeenCalledTimes(1);
	});

	it("delegates when accessibleNodeIds is empty (admin org-wide bypass)", async () => {
		mockLiabilitySummary.mockClear();
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [],
		});

		await call(
			commissionSplitsAnalyticsProcedures.liabilitySummary,
			{ organizationId: ORG_ID, ...VALID_RANGE, hierarchyNodeId: IN_SCOPE_NODE },
			{ context: ctx },
		);
		expect(mockLiabilitySummary).toHaveBeenCalledTimes(1);
	});
});

describe("commissionSplitsAnalytics.exportLiabilityCsv — hierarchyNodeId branch scope", () => {
	it("rejects a hierarchyNodeId outside accessibleNodeIds with FORBIDDEN", async () => {
		mockExportLiabilityCsv.mockClear();
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_NODE],
		});

		await expect(
			call(
				commissionSplitsAnalyticsProcedures.exportLiabilityCsv,
				{
					organizationId: ORG_ID,
					...VALID_RANGE,
					hierarchyNodeId: OUT_OF_SCOPE_NODE,
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockExportLiabilityCsv).not.toHaveBeenCalled();
	});

	it("delegates to the service when hierarchyNodeId is in scope", async () => {
		mockExportLiabilityCsv.mockClear();
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_NODE],
		});

		await call(
			commissionSplitsAnalyticsProcedures.exportLiabilityCsv,
			{ organizationId: ORG_ID, ...VALID_RANGE, hierarchyNodeId: IN_SCOPE_NODE },
			{ context: ctx },
		);
		expect(mockExportLiabilityCsv).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run test, verify FAIL**
  ```bash
  cd packages/api && bun test src/routers/commission-splits/analytics.procedures.test.ts
  ```
  Expected failure: the two "rejects … with FORBIDDEN" tests fail. Before the fix neither procedure guards `input.hierarchyNodeId`, so `call(...)` resolves (the mocked service returns) instead of rejecting — Bun reports the expected promise rejection never happened, and the `expect(mock...).not.toHaveBeenCalled()` assertion fails because the service WAS called with the out-of-scope node. The in-scope/empty-scope delegation tests pass already.

- [ ] **Step 3: Add the guard** (no import edit needed — `guardBranchAccessible` is already imported at lines 4-8 of `analytics.procedures.ts`)

  **3a. liabilitySummary** — insert the guard after the permission block, before `getControlPanelDb`. Current lines 77-79:
  ```ts
  		}

  		const controlPanelDb = getControlPanelDb(context);
  ```
  Change to:
  ```ts
  		}

  		if (input.hierarchyNodeId) {
  			guardBranchAccessible(input.hierarchyNodeId, context.accessibleNodeIds ?? []);
  		}

  		const controlPanelDb = getControlPanelDb(context);
  ```

  **3b. exportLiabilityCsv** — same insertion after its permission block. Current lines 222-224:
  ```ts
  		}

  		const controlPanelDb = getControlPanelDb(context);
  ```
  (this second occurrence is the `exportLiabilityCsvProcedure` handler — use `replace_all` is unsafe since the snippet is identical in both procedures; edit each by quoting more surrounding context, e.g. anchor 3a on the preceding `"commission_management:read or commission_payout:read required"` throw inside `liabilitySummaryProcedure` and 3b on the same throw inside `exportLiabilityCsvProcedure`). Insert the same block:
  ```ts
  		}

  		if (input.hierarchyNodeId) {
  			guardBranchAccessible(input.hierarchyNodeId, context.accessibleNodeIds ?? []);
  		}

  		const controlPanelDb = getControlPanelDb(context);
  ```

  **3c. Thread accessibleNodeIds into the service (so an OMITTED hierarchyNodeId no longer returns org-wide).** This is the second half of the audit fix and mirrors how `liabilityByStaff` already passes `accessibleNodeIds: context.accessibleNodeIds ?? []` (line 149).
  - In `packages/services/src/commission-splits.service.ts`, add to `LiabilitySummaryParams` (after line 1161, `roleType?: string | null;`):
    ```ts
  	/** Caller's accessible hierarchy node IDs. Empty array = admin / org-wide. */
  	accessibleNodeIds?: string[];
    ```
  - In `liabilitySummary` (line 1181 destructure + the WHERE-condition build near 1231): when `accessibleNodeIds` is provided and non-empty AND no explicit `hierarchyNodeId` was given, constrain the query by branch via the same `inArray(appointments.branchId, accessibleNodeIds) / inArray(salesOrders.branchId, accessibleNodeIds)` JOIN pattern that `liabilityByStaff` uses at lines 1936-1940. (Follow that block verbatim for the JOIN/`inArray` shape.)
  - At the two procedure call sites in `analytics.procedures.ts` (line 82 `liabilitySummary(...)` and line 227 `exportLiabilityCsv(...)`), add `accessibleNodeIds: context.accessibleNodeIds ?? [],` to the params object. `exportLiabilityCsv` forwards `params` straight into `liabilitySummary` (service line 2327), so adding the field to `ExportLiabilityCsvParams` (after line 2298) and passing it through covers both.

- [ ] **Step 4: Run test, verify PASS**
  ```bash
  cd packages/api && bun test src/routers/commission-splits/analytics.procedures.test.ts
  ```
  All five tests pass: out-of-scope `hierarchyNodeId` → `ORPCError` FORBIDDEN with the service never invoked; in-scope node and empty `accessibleNodeIds` (admin bypass) → service called once. Also run `cd packages/api && bun check-types` and the perimeter gate `node ../../scripts/ci/check-tenant-perimeter.mjs` (or `bun check`) to confirm no `record.branchId → guardInputBranchForContext` violation was introduced (this fix uses `guardBranchAccessible` on an INPUT value, which is allowed).

- [ ] **Step 5: Commit**
  ```bash
  git add packages/api/src/routers/commission-splits/analytics.procedures.ts \
          packages/api/src/routers/commission-splits/analytics.procedures.test.ts \
          packages/services/src/commission-splits.service.ts
  git commit -m "$(cat <<'EOF'
  fix(commission-splits): enforce branch scope on liabilitySummary + exportLiabilityCsv

  Both procedures accepted an optional hierarchyNodeId with no RBAC check and
  did not thread accessibleNodeIds into the service, so a caller could read
  another branch's commission liability (or get org-wide totals when the node
  was omitted). Guard input.hierarchyNodeId via guardBranchAccessible and pass
  accessibleNodeIds into liabilitySummary, mirroring liabilityByStaff.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

NOTE for the implementer: `guardBranchAccessible` is ALREADY imported in `analytics.procedures.ts` (lines 4-8) — no import edit required. The default mock member (`role: "admin"`) bypasses the OR-permission gate via `permission.service.ts` `member.role === "admin"`, which is why `makeAdminDb()` (all role/permission lookups miss) lets execution reach the branch guard. The named test file `packages/api/src/routers/commission-splits` did not exist as a single file; this creates `analytics.procedures.test.ts` colocated with the procedure file (matching the existing colocated pattern at `packages/api/src/routers/package-instances/client.procedures.test.ts`).

---

### Task 4: packageInstances.getById (staff path) — packages/api/src/routers/package-instances/client.procedures.ts
**Files:**
- Modify: `packages/api/src/routers/package-instances/client.procedures.ts:1-14` (import edit) and `:97-104` (insert guard after the isStaff/permission block)
- Test: `packages/api/src/routers/package-instances/client.procedures.test.ts` (append a new `describe("packageInstances.getById")` block to the existing file)

- [ ] **Step 1: Write the failing test**

Append this block to the END of the existing `packages/api/src/routers/package-instances/client.procedures.test.ts` (after the closing `});` of the `packageInstances.togglePin` describe on line 130). It reuses the file's real conventions: `createMockContext` from `../../test-utils/mock-context`, `call` from `@orpc/server`, literal v4-shaped UUID constants, and a loose `tenantDb` stub typed `as any`. The staff path is forced by passing a non-`SESSION_USER` `clientId` on the instance (so `isClient` is false, `isStaff` true → the permission + branch guard run). The default mock member is `role: "admin"` and `requirePermissionOrpc` calls the real `requirePermission` against the stub tenantDb — admins bypass, so the permission check passes and the branch guard is what we exercise.

```ts
// ---- packageInstances.getById — staff path branch-scope isolation ----

const SVC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IN_SCOPE_BRANCH = "node-root"; // matches createMockContext default accessibleNodeIds
const OUT_OF_SCOPE_BRANCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

// tenantDb stub for getById: the procedure calls
//   getPackageInstanceById(tenantDb, id) → tenantDb.query.packageInstances.findFirst()
//   (fix) tenantDb.query.services.findFirst()  → resolves service.branchId
// assignedTrainerId / preferredTrainerId left null so the enrichment selects are skipped.
function makeGetByIdDb(instance: unknown, service: unknown) {
	// biome-ignore lint/suspicious/noExplicitAny: loose test stub
	return {
		query: {
			packageInstances: {
				findFirst: () => Promise.resolve(instance ?? null),
			},
			services: {
				findFirst: () => Promise.resolve(service ?? null),
			},
		},
	} as any;
}

describe("packageInstances.getById", () => {
	it("staff caller for an out-of-scope service branch → FORBIDDEN", async () => {
		const ctx = createMockContext({
			// default member is role:"admin" → permission check bypasses;
			// default accessibleNodeIds is ["node-root"], which excludes OUT_OF_SCOPE_BRANCH.
			tenantDb: makeGetByIdDb(
				{
					id: PKG_ID,
					serviceId: SVC_ID,
					clientId: "someone-else", // not SESSION_USER → forces staff path
					assignedTrainerId: null,
					preferredTrainerId: null,
				},
				{ id: SVC_ID, branchId: OUT_OF_SCOPE_BRANCH },
			),
		});

		await expect(
			call(
				packageInstancesClientProcedures.getById,
				{ organizationId: ORG_ID, id: PKG_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("staff caller for an in-scope service branch → passes", async () => {
		const ctx = createMockContext({
			tenantDb: makeGetByIdDb(
				{
					id: PKG_ID,
					serviceId: SVC_ID,
					clientId: "someone-else",
					assignedTrainerId: null,
					preferredTrainerId: null,
				},
				{ id: SVC_ID, branchId: IN_SCOPE_BRANCH },
			),
		});

		const res = await call(
			packageInstancesClientProcedures.getById,
			{ organizationId: ORG_ID, id: PKG_ID },
			{ context: ctx },
		);

		expect(res.id).toBe(PKG_ID);
		expect(res.assignedTrainerName).toBeNull();
		expect(res.preferredTrainerName).toBeNull();
	});

	it("staff caller for an org-wide service (null branch) → passes", async () => {
		const ctx = createMockContext({
			tenantDb: makeGetByIdDb(
				{
					id: PKG_ID,
					serviceId: SVC_ID,
					clientId: "someone-else",
					assignedTrainerId: null,
					preferredTrainerId: null,
				},
				{ id: SVC_ID, branchId: null },
			),
		});

		const res = await call(
			packageInstancesClientProcedures.getById,
			{ organizationId: ORG_ID, id: PKG_ID },
			{ context: ctx },
		);

		expect(res.id).toBe(PKG_ID);
	});
});
```

Notes that make this compile/run against the real harness:
- `ORG_ID`, `PKG_ID`, `SESSION_USER` are already declared at the top of this file (lines 16-18) — do NOT redeclare them; only the new `SVC_ID` / branch constants are added.
- `createMockContext` defaults: `accessibleNodeIds: ["node-root"]`, `member: { role: "admin", ... }`, `session.user.id: "user-test-1"`. The instance `clientId: "someone-else"` differs from `"user-test-1"`, so `isClient` is false and the staff branch executes.
- The `services` table type has `branchId: string | null`, matching the `null` / out-of-scope cases.

- [ ] **Step 2: Run test, verify FAIL**

```
cd packages/api && bun test src/routers/package-instances/client.procedures.test.ts
```

Expected failure (pre-fix): the new `"staff caller for an out-of-scope service branch → FORBIDDEN"` test FAILS. Today the handler never reads `services` / never calls a branch guard, so the call resolves successfully (returns the enriched instance) and `.rejects.toMatchObject({ code: "FORBIDDEN" })` is not satisfied — bun reports "expected promise to reject" / received resolved value. The in-scope and org-wide tests pass already (no guard to violate).

- [ ] **Step 3: Add the guard**

Edit 1 — imports. The file imports `eq` (line 8) and the guards `requirePermissionOrpc, assertOrgContextMatch` (line 12) but NOT `guardStoredBranchForContext` and NOT the `services` table. Update both:

Change line 12 from:
```ts
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
```
to:
```ts
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardStoredBranchForContext,
} from "../../guards";
```

And add the `services` import directly under the existing `members` import (currently line 6 `import { members } from "@avantej-core/db/schema/tenant/members";`):
```ts
import { members } from "@avantej-core/db/schema/tenant/members";
import { services } from "@avantej-core/db/schema/tenant/services";
```

Edit 2 — the guard itself. Insert immediately AFTER the closing brace of the `if (isStaff && !isClient)` permission block (line 104) and BEFORE the `// Enrich with assigned trainer name` comment (line 106). Quoting the surrounding lines, change:

```ts
		if (isStaff && !isClient) {
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);
		}

		// Enrich with assigned trainer name when present
```
to:
```ts
		if (isStaff && !isClient) {
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);

			// Branch-scope isolation: a staff member may only read an instance
			// whose service is in their accessible hierarchy. Resolve the service's
			// branch and guard against context.accessibleNodeIds. A null/org-wide
			// service branch is allowed by guardStoredBranchForContext.
			const service = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, instance.serviceId),
			});
			await guardStoredBranchForContext(context, service?.branchId);
		}

		// Enrich with assigned trainer name when present
```

This places the guard inside the staff-only branch (per the FIX: "after isStaff/permission block"), so the client self-view path is unaffected. `guardStoredBranchForContext` is the correct guard for a stored record value (`service.branchId`) and satisfies the `check-tenant-perimeter.mjs` CI invariant (never pass a record branchId to `guardInputBranchForContext`).

- [ ] **Step 4: Run test, verify PASS**

```
cd packages/api && bun test src/routers/package-instances/client.procedures.test.ts
```

All four togglePin tests plus the three new getById tests pass: the out-of-scope branch now throws `ORPCError` `FORBIDDEN` (via `guardStoredBranchForContext` → `guardBranchAccessible`), the in-scope (`node-root`) and null/org-wide branches pass through.

- [ ] **Step 5: Commit**

```
git add packages/api/src/routers/package-instances/client.procedures.ts packages/api/src/routers/package-instances/client.procedures.test.ts
git commit -m "fix(package-instances): enforce branch-scope on getById staff path

Staff callers could read any package instance regardless of the service's
branch. After the isStaff/permission block, resolve the service branch for
instance.serviceId and guardStoredBranchForContext, so out-of-scope branches
return FORBIDDEN while org-wide (null-branch) services remain readable.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: packageInstances.downloadPaymentProof + listPaymentProofs + getAgreement — tenant-isolation branch guard

**Files:**
- Modify: `packages/api/src/routers/package-instances/payment-proof.procedures.ts:158-207` (`listPaymentProofs` handler L158-168, `downloadPaymentProof` handler L177-207) + imports L1-17
- Modify: `packages/api/src/routers/package-instances/agreement.procedures.ts:30-49` (`getAgreement` handler) + imports L1-13
- Test: `packages/api/src/routers/package-instances/payment-proof.procedures.test.ts` (NEW — no payment-proof/agreement test exists yet; only `client.procedures.test.ts` is present in this dir. New file follows that sibling's `createMockContext` + `call()` conventions.)

Audit fix: each of these three read procedures loads a record and returns/streams it without verifying the caller can access the record's branch. A staffer scoped to branch X can read another branch's payment proofs / agreement. Resolve `pkg → service.branchId` and `guardBranchAccessible(svc.branchId, context.accessibleNodeIds)` before returning, throwing `NOT_FOUND` (not FORBIDDEN) so an out-of-scope caller cannot use the error to confirm a proof/package exists (enumeration oracle). This mirrors `confirm-payment.procedures.ts:89-94`, which already does the `services.findFirst → guardBranchAccessible` lookup.

Grounding facts (real code read):
- `getPaymentProofById` (payment-proof.service.ts:133) returns the `payment_proofs` row — it carries `packageInstanceId` and `r2Key` but **no `branchId`** and **no `serviceId`**. So `downloadPaymentProof` must load the package (`packageInstances.findFirst`) then the service (`services.findFirst`) to reach `branchId`.
- `listPaymentProofs` only has `input.packageInstanceId` — same package→service→branch resolution.
- `getAgreement` calls `getPackageAgreement` (agreement.service.ts:68) which `innerJoin`s services but the returned view-model does **not** include `branchId`; resolve branch the same way.
- `requirePermissionOrpc` → `requirePermission` → `hasPermission` (permission.service.ts:98): with the default mock member (`role:"admin"`, `roleId` unset) it calls `tenantDb.query.roles.findFirst`; returning `undefined` falls through to `return member.role === "admin"` → `true`. So the mock tenantDb must expose `query.roles.findFirst → undefined` for the permission check to pass and let execution reach the branch guard.
- `guardBranchAccessible(branchId, accessibleNodeIds)` (guards.ts:55) throws `ORPCError FORBIDDEN` when `branchId` set and not in the array. Mock context default `accessibleNodeIds` = `["node-root"]`.
- CI invariant: `svc.branchId` is a **record** value → must use `guardBranchAccessible(svc.branchId, context.accessibleNodeIds)` (the pattern already in confirm-payment) — do NOT pass it to `guardInputBranchForContext`.

- [ ] **Step 1: Write the failing test** — new file `packages/api/src/routers/package-instances/payment-proof.procedures.test.ts`:

```ts
/**
 * Tenant-isolation guard for package-instance read procedures.
 *
 * listPaymentProofs / downloadPaymentProof (payment-proof.procedures) and
 * getAgreement (agreement.procedures) all load a record keyed only by id and
 * return it. Without a branch check, a staffer scoped to branch X can read
 * another branch's proofs/agreement. These tests assert the procedure resolves
 * pkg → service.branchId and rejects an out-of-scope branch with NOT_FOUND
 * (not FORBIDDEN — avoids an enumeration oracle), while an in-scope / admin
 * caller still passes.
 */

import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";
import { packageInstancesPaymentProofProcedures } from "./payment-proof.procedures";
import { packageInstancesAgreementProcedures } from "./agreement.procedures";
import { createMockContext } from "../../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PKG_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROOF_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SERVICE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const IN_SCOPE_BRANCH = "node-root"; // matches createMockContext default accessibleNodeIds
const OUT_OF_SCOPE_BRANCH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/**
 * Minimal tenantDb covering every read the three procedures + the permission
 * check touch:
 *   query.roles.findFirst        → undefined  (admin fallback → permission granted)
 *   query.paymentProofs.findFirst → proof row (id, packageInstanceId, r2Key, ...)
 *   query.packageInstances.findFirst → pkg row (id, serviceId)
 *   query.services.findFirst     → service row (id, branchId)  ← branch under test
 * getAgreement reads its view-model via select()...innerJoin()...limit(); we
 * stub that fluent chain to return a single joined row carrying branchId.
 */
function makeTenantDb(branchId: string | null) {
	const proofRow = {
		id: PROOF_ID,
		packageInstanceId: PKG_ID,
		r2Key: `org/${ORG_ID}/pkg/${PKG_ID}/proof/${PROOF_ID}/receipt.png`,
		fileName: "receipt.png",
		contentType: "image/png",
		byteSize: 1234,
		uploadedBy: "user-test-1",
		notes: null,
		uploadedAt: new Date("2026-06-01T00:00:00Z"),
	};
	const pkgRow = { id: PKG_ID, serviceId: SERVICE_ID };
	const serviceRow = { id: SERVICE_ID, branchId };
	const agreementJoinRow = {
		id: PKG_ID,
		serviceName: "Body Massage 60min",
		branchId,
		customerName: "Ahmad Firdaus",
		totalPrice: 30000,
		taxAmount: 0,
		creditsTotal: 10,
		startsAt: new Date("2026-06-01T00:00:00Z"),
		expiresAt: new Date("2026-09-01T00:00:00Z"),
		purchaseNumber: "P-0001",
		eSignature: null,
		termsAgreedAt: null,
	};
	// biome-ignore lint/suspicious/noExplicitAny: loose test stub
	return {
		query: {
			roles: { findFirst: async () => undefined },
			paymentProofs: {
				findFirst: async () => proofRow,
				findMany: async () => [proofRow],
			},
			packageInstances: { findFirst: async () => pkgRow },
			services: { findFirst: async () => serviceRow },
		},
		// Fluent select chain used by getPackageAgreement and (newly) the
		// getAgreement branch resolution if it resolves via select; both paths
		// terminate at .limit() / .findFirst() above.
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: () => ({
						limit: async () => [agreementJoinRow],
					}),
				}),
			}),
		}),
	} as any;
}

describe("packageInstances payment-proof / agreement reads — branch isolation", () => {
	describe("listPaymentProofs", () => {
		it("rejects a proof whose package's service branch is out of scope → NOT_FOUND", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(OUT_OF_SCOPE_BRANCH),
			});
			await expect(
				call(
					packageInstancesPaymentProofProcedures.listPaymentProofs,
					{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
					{ context: ctx },
				),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		it("returns proofs when the service branch is in scope", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(IN_SCOPE_BRANCH),
			});
			const res = await call(
				packageInstancesPaymentProofProcedures.listPaymentProofs,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			);
			expect(Array.isArray(res)).toBe(true);
			expect(res).toHaveLength(1);
		});
	});

	describe("downloadPaymentProof", () => {
		it("rejects an out-of-scope service branch before streaming → NOT_FOUND", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(OUT_OF_SCOPE_BRANCH),
				// PROOFS_BUCKET deliberately omitted: a correct guard must reject
				// BEFORE touching object storage, so the bucket is never reached.
			});
			await expect(
				call(
					packageInstancesPaymentProofProcedures.downloadPaymentProof,
					{ organizationId: ORG_ID, proofId: PROOF_ID },
					{ context: ctx },
				),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		it("passes the branch guard for an in-scope branch (reaches storage)", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(IN_SCOPE_BRANCH),
				honoBindings: {},
			});
			// In scope → guard passes, execution proceeds to getBucket(); with no
			// PROOFS_BUCKET binding it then fails on storage config (proving the
			// branch check did NOT short-circuit an in-scope caller).
			await expect(
				call(
					packageInstancesPaymentProofProcedures.downloadPaymentProof,
					{ organizationId: ORG_ID, proofId: PROOF_ID },
					{ context: ctx },
				),
			).rejects.toThrow(/PROOFS_BUCKET|storage is not configured/i);
		});
	});

	describe("getAgreement", () => {
		it("rejects an out-of-scope service branch → NOT_FOUND", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(OUT_OF_SCOPE_BRANCH),
			});
			await expect(
				call(
					packageInstancesAgreementProcedures.getAgreement,
					{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
					{ context: ctx },
				),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});

		it("returns the agreement when the service branch is in scope", async () => {
			const ctx = createMockContext({
				tenantDb: makeTenantDb(IN_SCOPE_BRANCH),
			});
			const res = await call(
				packageInstancesAgreementProcedures.getAgreement,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			);
			expect(res).toMatchObject({ packageInstanceId: PKG_ID });
		});

		it("admin with org-wide scope (empty accessibleNodeIds) still passes for an org-wide service (null branch)", async () => {
			const ctx = createMockContext({
				accessibleNodeIds: [],
				tenantDb: makeTenantDb(null),
			});
			const res = await call(
				packageInstancesAgreementProcedures.getAgreement,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			);
			expect(res).toMatchObject({ packageInstanceId: PKG_ID });
		});
	});
});
```

- [ ] **Step 2: Run test, verify FAIL**
```bash
cd packages/api && bun test src/routers/package-instances/payment-proof.procedures.test.ts
```
Expected failure (pre-fix): the three out-of-scope `NOT_FOUND` cases FAIL — current handlers never resolve the service branch, so `listPaymentProofs` resolves to the proof array, `getAgreement` returns the view-model, and `downloadPaymentProof` rejects with the wrong reason (`PROOFS_BUCKET` storage error) instead of `NOT_FOUND`. (`bun test` reports `expected NOT_FOUND` / no throw.) The in-scope cases pass.

- [ ] **Step 3: Add the guard** (three edits; resolve pkg → service.branchId then `guardBranchAccessible`, mapping out-of-scope to NOT_FOUND to avoid enumeration)

**3a — `payment-proof.procedures.ts` imports.** The file currently imports only `assertOrgContextMatch, assertTenantContext, requirePermissionOrpc` from guards and no Drizzle table/op. Add `guardBranchAccessible`, the `eq` operator, and the `packageInstances` + `services` tables. Replace lines 1-17:

Current (L1-17):
```ts
import {
	InvalidProofError,
	buildProofKey,
	getPaymentProofById,
	listPaymentProofs,
	packageInstanceExists,
	recordPaymentProof,
	validateProofUpload,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	assertTenantContext,
	requirePermissionOrpc,
} from "../../guards";
```
New:
```ts
import {
	InvalidProofError,
	buildProofKey,
	getPaymentProofById,
	listPaymentProofs,
	packageInstanceExists,
	recordPaymentProof,
	validateProofUpload,
} from "@avantej-core/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	assertTenantContext,
	guardBranchAccessible,
	requirePermissionOrpc,
} from "../../guards";
```

**3a (add a shared helper, right after the imports / before `export const ...Procedures`).** Insert this small resolver so both procedures share one branch check that maps out-of-scope to NOT_FOUND (no enumeration oracle):
```ts
/**
 * Resolve the package's service branch and verify the caller can access it.
 * Out-of-scope (or missing) records throw NOT_FOUND — never FORBIDDEN — so the
 * error cannot be used to confirm a package/proof exists in another branch.
 * Mirrors confirm-payment.procedures.ts:89-94.
 */
async function assertPackageBranchAccessible(
	context: { tenantDb: typeof import("../../context").Context.prototype.tenantDb; accessibleNodeIds?: string[] } | any,
	packageInstanceId: string,
): Promise<void> {
	const pkg = await context.tenantDb.query.packageInstances.findFirst({
		where: eq(packageInstances.id, packageInstanceId),
	});
	if (!pkg) {
		throw new ORPCError("NOT_FOUND", {
			message: `Package not found: ${packageInstanceId}`,
		});
	}
	const svc = await context.tenantDb.query.services.findFirst({
		where: eq(services.id, pkg.serviceId),
	});
	try {
		guardBranchAccessible(svc?.branchId, context.accessibleNodeIds);
	} catch {
		// Collapse FORBIDDEN → NOT_FOUND to avoid an enumeration oracle.
		throw new ORPCError("NOT_FOUND", {
			message: `Package not found: ${packageInstanceId}`,
		});
	}
}
```
(If the inline `context` type annotation is awkward, type the param as `any` — the file already uses loose `R2Like`/`unknown` stubs. The behaviour, not the annotation, is what the test asserts.)

**3a — wire `listPaymentProofs`.** Current handler body (L158-168):
```ts
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);
			return listPaymentProofs(context.tenantDb, input.packageInstanceId);
		}),
```
Insert the guard between the permission check and the return:
```ts
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);
			await assertPackageBranchAccessible(context, input.packageInstanceId);
			return listPaymentProofs(context.tenantDb, input.packageInstanceId);
		}),
```

**3a — wire `downloadPaymentProof`.** Current code around the proof load (L187-192):
```ts
			const proof = await getPaymentProofById(context.tenantDb, input.proofId);
			if (!proof) {
				throw new ORPCError("NOT_FOUND", {
					message: `Payment proof not found: ${input.proofId}`,
				});
			}

			const bucket = getBucket(context);
```
Insert the branch check immediately after the `if (!proof)` block and before `getBucket` (so an out-of-scope caller is rejected before any storage access):
```ts
			const proof = await getPaymentProofById(context.tenantDb, input.proofId);
			if (!proof) {
				throw new ORPCError("NOT_FOUND", {
					message: `Payment proof not found: ${input.proofId}`,
				});
			}
			await assertPackageBranchAccessible(context, proof.packageInstanceId);

			const bucket = getBucket(context);
```

**3b — `agreement.procedures.ts`.** This file also imports only `assertOrgContextMatch, assertTenantContext, requirePermissionOrpc`. Replace imports L1-13:

Current:
```ts
import {
	AgreementAlreadySignedError,
	getPackageAgreement,
	signPackageAgreement,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	assertTenantContext,
	requirePermissionOrpc,
} from "../../guards";
```
New:
```ts
import {
	AgreementAlreadySignedError,
	getPackageAgreement,
	signPackageAgreement,
} from "@avantej-core/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	assertTenantContext,
	guardBranchAccessible,
	requirePermissionOrpc,
} from "../../guards";
```
Then in the `getAgreement` handler, current body (L30-49):
```ts
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);

			const agreement = await getPackageAgreement(
				context.tenantDb,
				input.packageInstanceId,
			);
			if (!agreement) {
				throw new ORPCError("NOT_FOUND", {
					message: `Package not found: ${input.packageInstanceId}`,
				});
			}
			return agreement;
		}),
```
Insert the package→service→branch check after the permission call and before fetching the agreement (collapsing FORBIDDEN→NOT_FOUND inline, same enumeration-safe pattern):
```ts
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);

			const pkg = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.packageInstanceId),
			});
			if (!pkg) {
				throw new ORPCError("NOT_FOUND", {
					message: `Package not found: ${input.packageInstanceId}`,
				});
			}
			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, pkg.serviceId),
			});
			try {
				guardBranchAccessible(svc?.branchId, context.accessibleNodeIds);
			} catch {
				throw new ORPCError("NOT_FOUND", {
					message: `Package not found: ${input.packageInstanceId}`,
				});
			}

			const agreement = await getPackageAgreement(
				context.tenantDb,
				input.packageInstanceId,
			);
```
(`agreement.procedures.ts` is a small standalone file — duplicating the few lines inline here avoids a cross-file import. If preferred, factor the same `assertPackageBranchAccessible` helper into `package-instances/types.ts` or a local util and import into both files; either way the test asserts only the behaviour. Do NOT use `guardInputBranchForContext` — `svc.branchId` is a record value and the `check-tenant-perimeter.mjs` CI gate flags that.)

- [ ] **Step 4: Run test, verify PASS**
```bash
cd packages/api && bun test src/routers/package-instances/payment-proof.procedures.test.ts
```
All six cases green. Then run the full router suite + type-check to confirm no regression and the perimeter gate is satisfied:
```bash
cd packages/api && bun test src/routers/package-instances/
bun check-types
node scripts/ci/check-tenant-perimeter.mjs   # from repo root — confirms no record.branchId → guardInputBranchForContext
```

- [ ] **Step 5: Commit**
```bash
git add packages/api/src/routers/package-instances/payment-proof.procedures.ts \
        packages/api/src/routers/package-instances/agreement.procedures.ts \
        packages/api/src/routers/package-instances/payment-proof.procedures.test.ts
git commit -m "fix(api): enforce branch isolation on package payment-proof + agreement reads

listPaymentProofs, downloadPaymentProof, and getAgreement loaded records by
id and returned them without verifying the caller could access the package's
service branch — a staffer scoped to one branch could read another branch's
payment proofs / agreement. Resolve pkg → service.branchId and
guardBranchAccessible before returning; collapse out-of-scope to NOT_FOUND to
avoid an enumeration oracle. Mirrors confirm-payment.procedures.ts:89-94.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: refunds.getById — packages/api/src/routers/refunds/read.procedures.ts
**Files:**
- Modify: `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/packages/api/src/routers/refunds/read.procedures.ts` (import at lines 8-12; insert new guard after line 106, before `return refund;` at line 107)
- Test: `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/packages/api/src/routers/refunds.router.test.ts` (append a new `describe("refundsRouter.getById")` block; the file already exists with full mock harness for request/process/bulkApprove)

- [ ] **Step 1: Write the failing test** — append this block to the end of `refunds.router.test.ts` (after the closing `});` of the `bulkApprove` describe at line 473). It reuses the existing `makeAdminDb({ refunds: {...} })` override pattern (lines 44-61, 391-393), the literal v4 UUID style (lines 21-24), and `createMockContext` (line 19). The admin default member (`role: "admin"`, `accessibleNodeIds: ["node-root"]`) means `requirePermissionOrpc` passes, so the only thing under test is the stored-branch guard.

```ts
// ─── getById ─────────────────────────────────────────────────────────────────

describe("refundsRouter.getById", () => {
	const OUT_OF_SCOPE_BRANCH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
	const IN_SCOPE_BRANCH = "ffffffff-ffff-4fff-8fff-ffffffffffff";
	const validInput = { organizationId: ORG_ID, id: REFUND_ID };

	it("throws FORBIDDEN when the refund's branchId is not in accessibleNodeIds", async () => {
		const outOfScopeRefund = { ...REFUND_ROW, branchId: OUT_OF_SCOPE_BRANCH };
		const tenantDb = makeAdminDb({
			refunds: { findFirst: mock(() => Promise.resolve(outOfScopeRefund)) },
		});
		// Caller can reach IN_SCOPE_BRANCH only — not the refund's branch.
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		await expect(
			call(refundsRouter.getById, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("returns the refund when its branchId is in accessibleNodeIds", async () => {
		const inScopeRefund = { ...REFUND_ROW, branchId: IN_SCOPE_BRANCH };
		const tenantDb = makeAdminDb({
			refunds: { findFirst: mock(() => Promise.resolve(inScopeRefund)) },
		});
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		const result = await call(refundsRouter.getById, validInput, {
			context: ctx,
		});
		expect(result).toMatchObject({ id: REFUND_ID, branchId: IN_SCOPE_BRANCH });
	});

	it("returns an org-wide refund (null branchId) even with no accessible nodes", async () => {
		// REFUND_ROW.branchId is null → org-wide → guard is a no-op.
		const tenantDb = makeAdminDb();
		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		const result = await call(refundsRouter.getById, validInput, {
			context: ctx,
		});
		expect(result).toMatchObject({ id: REFUND_ID });
	});
});
```

- [ ] **Step 2: Run test, verify FAIL**
```bash
cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/packages/api && bun test src/routers/refunds.router.test.ts
```
Expected failure: the first test (`throws FORBIDDEN when the refund's branchId is not in accessibleNodeIds`) fails — the current handler returns the out-of-scope refund without any branch check, so `call(...)` resolves instead of rejecting. Bun reports the `rejects.toMatchObject({ code: "FORBIDDEN" })` assertion failed because the promise did not reject. The other two tests pass (they exercise no guard / a permitted branch).

- [ ] **Step 3: Add the guard** — two edits in `read.procedures.ts`.

Edit 1 — extend the existing guards import (lines 8-12). Change:
```ts
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../../guards";
```
to:
```ts
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
	guardStoredBranchForContext,
} from "../../guards";
```

Edit 2 — insert the stored-branch guard in the `getById` handler, immediately after the NOT_FOUND block (line 106) and before `return refund;` (line 107). Change:
```ts
			const refund = await getRefundById(context.tenantDb, input.id);
			if (!refund) {
				throw new ORPCError("NOT_FOUND", {
					message: `Refund ${input.id} not found`,
				});
			}
			return refund;
```
to:
```ts
			const refund = await getRefundById(context.tenantDb, input.id);
			if (!refund) {
				throw new ORPCError("NOT_FOUND", {
					message: `Refund ${input.id} not found`,
				});
			}
			await guardStoredBranchForContext(context, refund.branchId);
			return refund;
```
Note: `refund.branchId` is a record value, so `guardStoredBranchForContext` is correct here (passing it to `guardInputBranchForContext` would trip `check-tenant-perimeter.mjs`). `null`/`""`/`undefined` branchId early-returns inside the guard, preserving org-wide-refund access.

- [ ] **Step 4: Run test, verify PASS**
```bash
cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/packages/api && bun test src/routers/refunds.router.test.ts
```
All `refundsRouter.getById` tests pass; the request/process/bulkApprove suites remain green.

- [ ] **Step 5: Commit**
```bash
cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14 && git add packages/api/src/routers/refunds/read.procedures.ts packages/api/src/routers/refunds.router.test.ts && git commit -m "$(cat <<'EOF'
fix(refunds): enforce branch-scope RBAC on refunds.getById

getById loaded any refund by id after the permission check without
verifying the refund's branch is within the caller's accessibleNodeIds,
letting a scoped member read another branch's refund (cross-branch leak).
Add guardStoredBranchForContext(context, refund.branchId) after the
NOT_FOUND check. Org-wide refunds (null branchId) still pass.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: members.newToday — packages/api/src/routers/members/read.procedures.ts
**Files:**
- Modify: `packages/api/src/routers/members/read.procedures.ts:11-15` (import) and `:138-143` (handler body)
- Test: `packages/api/src/routers/members.test.ts`

- [ ] **Step 1: Write the failing test**

Append this `describe` block to `packages/api/src/routers/members.test.ts`. It builds a `tenantDb` whose `select().from().where()` (and the `.orderBy().limit()` chain `getMembersNewToday` uses) returns canned rows, then proves an out-of-scope `branchId` is rejected with `FORBIDDEN` while an in-scope `branchId` and the admin/no-branch path still pass. The UUID constants follow this file's existing v4-shaped literal style (`ORG_ID`, `MEMBER_ID` at lines 15-16).

```ts
// --- members.newToday branch-scope guard (tenant isolation) ---

const IN_SCOPE_BRANCH = "33333333-3333-4333-8333-333333333333";
const OUT_OF_SCOPE_BRANCH = "44444444-4444-4444-8444-444444444444";

/**
 * Build a tenantDb covering exactly what `getMembersNewToday` touches:
 *   - `select().from().where()` (count query) -> resolves to [{ cnt }]
 *   - `select().from().where().orderBy().limit()` (recent query) -> rows
 *   - `query.roles.findFirst` for the requirePermission admin-bypass path.
 *
 * The same `select` stub backs both queries; `where()` returns a thenable that
 * also exposes `orderBy().limit()`, so both Promise.all branches resolve.
 */
function buildNewTodayTenantDb() {
	const recentRows = [
		{
			id: MEMBER_ID,
			userId: "user-1",
			joinedAt: new Date(),
		},
	];
	const countRows = [{ cnt: 1 }];

	const whereResult: Record<string, unknown> = {
		orderBy: mock(() => ({
			limit: mock(() => Promise.resolve(recentRows)),
		})),
		// count query awaits `.where(...)` directly — make it a thenable.
		then: (resolve: (v: unknown) => unknown) => resolve(countRows),
	};
	const selectBuilder = {
		from: mock(() => ({ where: mock(() => whereResult) })),
	};

	return {
		query: {
			roles: {
				findFirst: mock(() => Promise.resolve(undefined)),
			},
		},
		select: mock(() => selectBuilder),
	} as unknown as never;
}

describe("memberRouter.newToday", () => {
	it("throws FORBIDDEN when branchId is outside the caller's accessibleNodeIds", async () => {
		const tenantDb = buildNewTodayTenantDb();
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			// Non-admin so the branch guard is the gate, not the admin bypass.
			member: {
				id: "member-test-1",
				userId: "user-test-1",
				role: "manager" as const,
				status: "active" as const,
				hierarchyScopeId: IN_SCOPE_BRANCH,
			},
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});

		await expect(
			call(
				memberRouter.newToday,
				{ organizationId: ORG_ID, branchId: OUT_OF_SCOPE_BRANCH },
				{ context },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("allows an in-scope branchId", async () => {
		const tenantDb = buildNewTodayTenantDb();
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			member: {
				id: "member-test-1",
				userId: "user-test-1",
				role: "manager" as const,
				status: "active" as const,
				hierarchyScopeId: IN_SCOPE_BRANCH,
			},
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});

		const result = await call(
			memberRouter.newToday,
			{ organizationId: ORG_ID, branchId: IN_SCOPE_BRANCH },
			{ context },
		);

		expect(result.count).toBe(1);
		expect(result.recent).toHaveLength(1);
	});

	it("allows admin (empty accessibleNodeIds) with no branchId", async () => {
		const tenantDb = buildNewTodayTenantDb();
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			// default admin member; admin sees all nodes
			accessibleNodeIds: [],
		});

		const result = await call(
			memberRouter.newToday,
			{ organizationId: ORG_ID },
			{ context },
		);

		expect(result.count).toBe(1);
	});
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd packages/api && bun test src/routers/members.test.ts
```

Expected failure: the first test (`throws FORBIDDEN when branchId is outside the caller's accessibleNodeIds`) FAILS. With no guard, `newToday` reaches `getMembersNewToday`, where line 65 `const scopeIds = branchId ? [branchId] : accessibleNodeIds;` makes the out-of-scope `OUT_OF_SCOPE_BRANCH` replace `accessibleNodeIds`, the call resolves successfully (returns `{ count: 1, recent: [...] }`), and the `.rejects.toMatchObject({ code: "FORBIDDEN" })` assertion fails because the promise did not reject. The two passing-path tests are green even before the fix.

- [ ] **Step 3: Add the guard**

Edit 1 — add `guardInputBranchForContext` to the existing guards import (currently lines 11-15):

```ts
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	resolveAccessibleNodeIds,
	guardInputBranchForContext,
} from "../../guards";
```

Edit 2 — in the `newToday` handler, insert the input-branch guard immediately after `resolveAccessibleNodeIds` and before the `getMembersNewToday` call. Current code (lines 138-143):

```ts
			const accessibleNodeIds = await resolveAccessibleNodeIds(context);

			return getMembersNewToday(context.tenantDb, {
				accessibleNodeIds,
				branchId: input.branchId,
			});
```

becomes:

```ts
			const accessibleNodeIds = await resolveAccessibleNodeIds(context);

			// Tenant isolation: a requested branchId must be within the caller's
			// scope. Without this, member-stats.service line 65 lets branchId
			// REPLACE accessibleNodeIds, leaking any branch's new-member stats.
			await guardInputBranchForContext(context, input.branchId);

			return getMembersNewToday(context.tenantDb, {
				accessibleNodeIds,
				branchId: input.branchId,
			});
```

Note: pass `input.branchId` (an INPUT value) to `guardInputBranchForContext` — never `record.branchId` — so the `check-tenant-perimeter.mjs` CI gate stays green. `input.branchId` is `z.string().uuid().optional()`, so `undefined` (no branch) skips the check and the admin/no-branch path is unaffected.

- [ ] **Step 4: Run test, verify PASS**

```bash
cd packages/api && bun test src/routers/members.test.ts
```

All three `memberRouter.newToday` tests pass: the out-of-scope branch now rejects with `code: "FORBIDDEN"` (raised by `guardInputBranchForContext` → `guardBranchAccessible`), the in-scope branch resolves to `{ count: 1, recent: [...] }`, and the admin empty-`accessibleNodeIds`/no-branch path returns `{ count: 1, ... }`.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/members/read.procedures.ts packages/api/src/routers/members.test.ts
git commit -m "fix(members): guard newToday branchId against cross-branch stat leak

input.branchId on members.newToday replaced accessibleNodeIds in
member-stats.service (line 65), letting any caller read new-member
counts for any branch in the tenant. Add guardInputBranchForContext
before the service call so an out-of-scope branchId is FORBIDDEN.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: appointments.statusHistory — packages/api/src/routers/appointments/list-detail.procedures.ts
**Files:**
- Modify: `packages/api/src/routers/appointments/list-detail.procedures.ts:133-141` (insert the load + guard immediately after `requirePermissionOrpc`, before `const limit = input.limit`)
- Test: `packages/api/src/routers/appointments.router.test.ts` (append a new `describe("appointmentsRouter.statusHistory")` block)

- [ ] **Step 1: Write the failing test**

Append this block to the end of `packages/api/src/routers/appointments.router.test.ts`. It reuses the existing `mockGetApptById` (registered at lines 360-385, returns `branchId: BRANCH_ID`) and the existing `BRANCH_ID` / `OTHER_BRANCH` constants. `statusHistory` reads `cpUsers` only when there are history rows; `getAppointmentStatusHistory` is mocked to return `[]`, so no control-panel DB stub is needed.

```ts
// ---------------------------------------------------------------------------
// statusHistory — tenant-isolation guard (loaded-record branch check)
// ---------------------------------------------------------------------------

const statusHistoryInput = {
	organizationId: ORG_ID,
	appointmentId: APPT_ID,
};

describe("appointmentsRouter.statusHistory", () => {
	beforeEach(() => {
		mockGetApptById.mockClear();
		mockGetApptById.mockImplementation(() =>
			Promise.resolve({
				id: APPT_ID,
				status: "confirmed",
				branchId: BRANCH_ID,
				userId: null,
				salesOrderId: null,
				serviceId: "svc-1",
			}),
		);
	});

	it("rejects when the appointment's branch is outside the caller's scope", async () => {
		// Appointment is pinned to BRANCH_ID, caller can only see OTHER_BRANCH.
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeUpdateDb(),
			accessibleNodeIds: [OTHER_BRANCH],
		});

		await expect(
			call(appointmentsRouter.statusHistory, statusHistoryInput, {
				context: ctx,
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("returns NOT_FOUND when the appointment does not exist", async () => {
		mockGetApptById.mockImplementation(() => Promise.resolve(null));
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeUpdateDb(),
			accessibleNodeIds: [BRANCH_ID],
		});

		await expect(
			call(appointmentsRouter.statusHistory, statusHistoryInput, {
				context: ctx,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("passes when the appointment's branch is in scope", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeUpdateDb(),
			accessibleNodeIds: [BRANCH_ID],
		});

		const result = await call(
			appointmentsRouter.statusHistory,
			statusHistoryInput,
			{ context: ctx },
		);
		expect(result).toEqual({ rows: [], nextCursor: null });
	});

	it("passes for an org-wide (null-branch) appointment regardless of scope", async () => {
		mockGetApptById.mockImplementation(() =>
			Promise.resolve({
				id: APPT_ID,
				status: "confirmed",
				branchId: null,
				userId: null,
				salesOrderId: null,
				serviceId: "svc-1",
			}),
		);
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeUpdateDb(),
			accessibleNodeIds: [OTHER_BRANCH],
		});

		const result = await call(
			appointmentsRouter.statusHistory,
			statusHistoryInput,
			{ context: ctx },
		);
		expect(result).toEqual({ rows: [], nextCursor: null });
	});
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd packages/api && bun test src/routers/appointments.router.test.ts
```

Expected failure: the first test (`rejects when the appointment's branch is outside the caller's scope`) FAILS because `statusHistory` never loads the appointment or checks its branch — the call resolves to `{ rows: [], nextCursor: null }` instead of rejecting, so `.rejects.toMatchObject` fails ("Expected promise to reject"). The `NOT_FOUND` test also FAILS for the same reason (no load → no NOT_FOUND). The two "passes" tests already pass.

- [ ] **Step 3: Add the guard**

In `packages/api/src/routers/appointments/list-detail.procedures.ts`, the `statusHistory` handler currently begins (lines 133-142):

```ts
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"appointment_management",
				"read",
			);

			const limit = input.limit;
```

Insert the load + guard between the `requirePermissionOrpc` call and `const limit = input.limit;`, mirroring `getById` (line 93-98, 115):

```ts
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"appointment_management",
				"read",
			);

			const appointment = await getAppointmentById(
				context.tenantDb,
				input.appointmentId,
			);
			if (!appointment) {
				throw new ORPCError("NOT_FOUND", {
					message: "Appointment not found",
				});
			}
			await guardStoredBranchForContext(context, appointment.branchId);

			const limit = input.limit;
```

No import edits required: `getAppointmentById` (line 2), `guardStoredBranchForContext` (line 12), and `ORPCError` (line 6) are all already imported in this file.

- [ ] **Step 4: Run test, verify PASS**

```bash
cd packages/api && bun test src/routers/appointments.router.test.ts
```

All four new `statusHistory` tests pass; existing `create` / `cancelSeries` / `cancelFuture` / `commission triggers` suites remain green.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/appointments/list-detail.procedures.ts packages/api/src/routers/appointments.router.test.ts
git commit -m "$(cat <<'EOF'
fix(api): enforce branch scope on appointments.statusHistory

statusHistory checked appointment_management:read but never loaded the
parent appointment, so a caller scoped to branch A could read the status
history of an appointment pinned to branch B. Load the appointment and
run guardStoredBranchForContext (mirroring getById); return NOT_FOUND for
missing rows to avoid enumeration.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: invoices.getById + getDetail + paymentStatusHistory — packages/api/src/routers/invoices.ts
**Files:**
- Modify: `packages/api/src/routers/invoices.ts` (imports at line 5; `getById` handler lines 96–112; `getDetail` handler lines 127–143; `paymentStatusHistory` handler lines 243–300)
- Test: `packages/api/src/routers/invoices.test.ts` (NEW FILE — does not exist; nearest siblings are `members.test.ts` and `refunds.router.test.ts`. Matching the `invoices.ts` base name, use `invoices.test.ts`.)

Background grounded in the real code:
- The `invoices` table has **no `branchId`** column (`packages/db/src/schema/tenant/invoices.ts`); it has `salesOrderId` (FK, line 16) and `paymentId` (line 20). Branch lives on `salesOrders.branchId` (NOT NULL, `sales-orders.ts:44`).
- `listInvoices` enforces scope by `innerJoin(salesOrders).where(inArray(salesOrders.branchId, accessibleNodeIds))` (`invoice.service.ts:97–105`). `getInvoiceById` (`:135`) and `getInvoiceWithItems` (`:151`) do a bare `query.invoices.findFirst` with **no branch join** — this is the bypass.
- `getPaymentStatusHistory` (`payments.service.ts:13`) keys on `paymentId`; `payments` has no `branchId`/`salesOrderId`. The branch is reachable via the invoice whose `paymentId` matches (`invoices.paymentId` index, `invoices.ts:41`) → that invoice's `salesOrderId` → `salesOrders.branchId`.
- Fix per audit: load the linked `salesOrder` for the record and call `guardStoredBranchForContext(context, order.branchId)` (a **record** branchId, so `guardStoredBranchForContext` — NOT `guardInputBranchForContext`; the CI perimeter gate enforces this split).
- Admin/empty scope: the default mock member is `role: "admin"`; `requirePermission` returns true when `roles.findFirst` is undefined and `member.role === "admin"` (`permission.service.ts:120–122`). With `accessibleNodeIds: []`, `guardStoredBranchForContext` → `resolveAccessibleNodeIds` returns `[]` → `assertBranchAccessible(branchId, [])`. Verify `assertBranchAccessible` semantics below — if empty array denies, the admin bypass test must instead pass an in-scope `accessibleNodeIds`. **(Confirm during Step 1 by reading `assertBranchAccessible` in `packages/services/src`.)** The default mock `accessibleNodeIds` is `["node-root"]`, so the in-scope test uses `branchId: "node-root"` to pass.

- [ ] **Step 1: Write the failing test**

First confirm `assertBranchAccessible([])` semantics (whether empty array = allow-all-admin or deny). Then write the file. The tests below use an **in-scope** branch (`"node-root"`, the default `accessibleNodeIds`) for the pass case and an **out-of-scope** uuid for the fail case — this is independent of the empty-array question.

```ts
/**
 * Invoices Router — tenant-isolation tests for by-id reads.
 *
 * getById / getDetail / paymentStatusHistory previously did a bare
 * query.invoices.findFirst with NO branch join, bypassing the
 * salesOrders.branchId scope that listInvoices enforces. These tests pin the
 * fix: a record whose linked salesOrder.branchId is outside the caller's
 * accessibleNodeIds must be rejected (FORBIDDEN); an in-scope branch passes.
 *
 * Permission: default mock member is role "admin"; requirePermission grants
 * because roles.findFirst → undefined and member.role === "admin"
 * (permission.service.ts:120-122). We mock roles/permissions findFirst → undefined.
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { invoicesRouter } from "./invoices";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const SALES_ORDER_ID = "22222222-2222-4222-8222-222222222222";
const PAYMENT_ID = "33333333-3333-4333-8333-333333333333";

// Default mock accessibleNodeIds is ["node-root"]; an in-scope sales order
// uses that branch, an out-of-scope one uses a uuid not in the array.
const IN_SCOPE_BRANCH = "node-root";
const OUT_OF_SCOPE_BRANCH = "99999999-9999-4999-8999-999999999999";

function invoiceRow(overrides: Record<string, unknown> = {}) {
	return {
		id: INVOICE_ID,
		invoiceNumber: "INV-20260625-000001",
		salesOrderId: SALES_ORDER_ID,
		paymentId: PAYMENT_ID,
		date: new Date(),
		dueDate: null,
		customerId: null,
		customerName: "Ahmad Firdaus",
		createdBy: null,
		paymentMode: null,
		totalAmount: 30000,
		amountPaid: 0,
		status: "draft",
		eInvoiceStatus: null,
		eInvoiceId: null,
		updatedAt: new Date(),
		...overrides,
	};
}

/**
 * Mock tenantDb. branchId controls the linked salesOrders.branchId returned for
 * the invoice's salesOrderId. roles/permissions findFirst → undefined drives the
 * admin permission fast-path. No createdBy on the row → control-panel lookup skipped.
 */
function makeDb(branchId: string | null) {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			invoices: {
				// getInvoiceById / getInvoiceWithItems load by id; paymentStatusHistory's
				// fix loads by paymentId — both go through findFirst here.
				findFirst: mock(() => Promise.resolve(invoiceRow())),
			},
			paymentItems: { findMany: mock(() => Promise.resolve([])) },
			salesOrders: {
				findFirst: mock(() =>
					Promise.resolve(
						branchId === null
							? null
							: { id: SALES_ORDER_ID, branchId },
					),
				),
			},
		},
		// getPaymentStatusHistory does db.select().from().where().orderBy().limit()
		select: mock(() => {
			const chain: Record<string, unknown> = {};
			for (const m of ["from", "where", "orderBy", "limit", "leftJoin"]) {
				chain[m] = mock(() => chain);
			}
			chain.then = (resolve: (v: unknown) => unknown) =>
				Promise.resolve([]).then(resolve);
			return chain;
		}),
	} as unknown as never;
}

// ─── getById ──────────────────────────────────────────────────────────────────

describe("invoicesRouter.getById tenant isolation", () => {
	const input = { organizationId: ORG_ID, id: INVOICE_ID };

	it("rejects an invoice whose linked salesOrder.branchId is out of scope", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(OUT_OF_SCOPE_BRANCH) });
		await expect(
			call(invoicesRouter.getById, input, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("allows an invoice whose linked salesOrder.branchId is in scope", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(IN_SCOPE_BRANCH) });
		const result = await call(invoicesRouter.getById, input, { context: ctx });
		expect(result).toMatchObject({ id: INVOICE_ID });
	});
});

// ─── getDetail ──────────────────────────────────────────────────────────────

describe("invoicesRouter.getDetail tenant isolation", () => {
	const input = { organizationId: ORG_ID, id: INVOICE_ID };

	it("rejects detail for an out-of-scope branch", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(OUT_OF_SCOPE_BRANCH) });
		await expect(
			call(invoicesRouter.getDetail, input, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("returns detail for an in-scope branch", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(IN_SCOPE_BRANCH) });
		const result = await call(invoicesRouter.getDetail, input, {
			context: ctx,
		});
		expect(result).toMatchObject({ invoice: { id: INVOICE_ID } });
	});
});

// ─── paymentStatusHistory ─────────────────────────────────────────────────────

describe("invoicesRouter.paymentStatusHistory tenant isolation", () => {
	const input = { organizationId: ORG_ID, paymentId: PAYMENT_ID, limit: 50 };

	it("rejects history when the payment's invoice branch is out of scope", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(OUT_OF_SCOPE_BRANCH) });
		await expect(
			call(invoicesRouter.paymentStatusHistory, input, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("returns history when the payment's invoice branch is in scope", async () => {
		const ctx = createMockContext({ tenantDb: makeDb(IN_SCOPE_BRANCH) });
		const result = await call(invoicesRouter.paymentStatusHistory, input, {
			context: ctx,
		});
		expect(result).toMatchObject({ rows: [], nextCursor: null });
	});
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd packages/api && bun test src/routers/invoices.test.ts
```
Expected failure (before the fix): the three "rejects … out of scope" tests FAIL because `getById`/`getDetail`/`paymentStatusHistory` never load the sales order or call any branch guard — they resolve and return the row, so `rejects.toMatchObject({ code: "FORBIDDEN" })` does not match (the call resolves instead of rejecting). The three in-scope tests already pass.

- [ ] **Step 3: Add the guard**

**3a. Import the guard.** The router imports guards from `"../guards"` (top-level router file). Extend line 5:

Current (line 5):
```ts
import { requirePermissionOrpc, assertOrgContextMatch } from "../guards";
```
Replace with:
```ts
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	assertTenantContext,
	guardStoredBranchForContext,
} from "../guards";
```
(`assertTenantContext` narrows `context` to `{ tenantDb; member }` so `guardStoredBranchForContext`'s typed signature accepts it. Add the `salesOrders` import too — next step.)

Add the schema import for the sales-order lookup. After line 14 (`import { user as cpUsers } …`) insert:
```ts
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { eq } from "drizzle-orm";
```
(`eq` is needed for the `paymentStatusHistory` invoice-by-paymentId lookup. `invoices` only needed there too.)

**3b. `getById` — guard the loaded record's branch.** In the handler (lines 105–111), after the not-found check, before `return invoice`:

Current:
```ts
			const invoice = await getInvoiceById(context.tenantDb, input.id);
			if (!invoice) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			return invoice;
```
Replace with:
```ts
			const invoice = await getInvoiceById(context.tenantDb, input.id);
			if (!invoice) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			assertTenantContext(context);
			// Branch scope lives on the linked sales order (invoices have no branchId).
			// An invoice with no sales order has no branch context to authorise against —
			// hide it from scoped staff (mirrors listInvoices orphan handling) via NOT_FOUND.
			if (invoice.salesOrderId) {
				const order = await context.tenantDb.query.salesOrders.findFirst({
					where: eq(salesOrders.id, invoice.salesOrderId),
					columns: { branchId: true },
				});
				await guardStoredBranchForContext(context, order?.branchId);
			}
			return invoice;
```

**3c. `getDetail` — same guard on `detail.invoice`.** In the handler (lines 136–142):

Current:
```ts
			const detail = await getInvoiceWithItems(context.tenantDb, input.id);
			if (!detail) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			return detail;
```
Replace with:
```ts
			const detail = await getInvoiceWithItems(context.tenantDb, input.id);
			if (!detail) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			assertTenantContext(context);
			if (detail.invoice.salesOrderId) {
				const order = await context.tenantDb.query.salesOrders.findFirst({
					where: eq(salesOrders.id, detail.invoice.salesOrderId),
					columns: { branchId: true },
				});
				await guardStoredBranchForContext(context, order?.branchId);
			}
			return detail;
```

**3d. `paymentStatusHistory` — derive branch via the payment's invoice.** Insert the guard immediately after the permission check (after line 250, before `const limit = …` at line 252):

Current (lines 244–252):
```ts
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"payments",
				"read",
			);

			const limit = input.limit ?? 50;
```
Replace with:
```ts
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"payments",
				"read",
			);

			assertTenantContext(context);
			// payments carry no branchId; resolve scope via the invoice that owns this
			// paymentId → its sales order branch. No linked invoice/sales order = no
			// branch context = hidden from scoped staff (NOT_FOUND, no enumeration).
			const linkedInvoice = await context.tenantDb.query.invoices.findFirst({
				where: eq(invoices.paymentId, input.paymentId),
				columns: { salesOrderId: true },
			});
			if (linkedInvoice?.salesOrderId) {
				const order = await context.tenantDb.query.salesOrders.findFirst({
					where: eq(salesOrders.id, linkedInvoice.salesOrderId),
					columns: { branchId: true },
				});
				await guardStoredBranchForContext(context, order?.branchId);
			}

			const limit = input.limit ?? 50;
```

Note for the implementer: the `eq` import may already be transitively present — `invoices.ts` currently imports `inArray` from `drizzle-orm` (line 3). Add `eq` to that existing import instead of a duplicate line if line 3 is `import { inArray } from "drizzle-orm";` → make it `import { eq, inArray } from "drizzle-orm";` and drop the separate `eq` import added in 3a.

- [ ] **Step 4: Run test, verify PASS**

```bash
cd packages/api && bun test src/routers/invoices.test.ts
```
All six tests pass. Then guard against regressions repo-wide:
```bash
cd packages/api && bun test src/routers/invoices.test.ts && node ../../scripts/ci/check-tenant-perimeter.mjs && bunx tsc -b
```
(Confirm `check-tenant-perimeter.mjs` passes — it flags any `record.branchId` passed to `guardInputBranchForContext`; we used `guardStoredBranchForContext`, which is the compliant call.)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/invoices.ts packages/api/src/routers/invoices.test.ts
git commit -m "fix(invoices): enforce salesOrder branch scope on by-id reads

getById/getDetail/paymentStatusHistory did a bare invoice lookup with no
branch join, bypassing the salesOrders.branchId scope that listInvoices
enforces — a scoped staffer could read any tenant invoice/payment history by
id. Load the linked sales order and guardStoredBranchForContext on its
branchId (invoices carry no branchId of their own; paymentStatusHistory
resolves the branch via the invoice that owns the paymentId).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

Implementer caveat to verify in Step 1 (grounded note, not a placeholder): I confirmed `salesOrders.branchId` is NOT NULL and the admin permission fast-path keys on `member.role === "admin"` with `roles.findFirst → undefined`. The one thing to confirm by reading `assertBranchAccessible` (`packages/services/src`, imported into `guards.ts:5`) is its empty-array behavior — but the tests above sidestep it entirely by using the real default `accessibleNodeIds: ["node-root"]` and a matching in-scope branch, so they hold regardless.

---

### Task 10: categoryCommission.getByCategory + upsert + delete — packages/api/src/routers/category-commission.ts
**Files:**
- Modify: `packages/api/src/routers/category-commission.ts` — import edit at lines 4-10; insert guard calls inside `getByCategory` (after line 26, before line 28), `upsert` (after line 95, before line 97), `deleteConfig` (after line 146, before line 148)
- Test: `packages/api/src/routers/category-commission.router.test.ts` (NEW FILE — no test currently exists for this router; named to match the sibling `*.router.test.ts` convention used by `services.router.test.ts`, `payouts.router.test.ts`, etc.)

- [ ] **Step 1: Write the failing test** (the three procedures resolve the `service_categories` row via `getServiceCategoryById`, which calls `tenantDb.query.serviceCategories.findFirst`. The mock DB returns a category whose `branchId` is set; an out-of-scope branch must throw FORBIDDEN, an in-scope/admin-empty-scope caller must pass. Mock setup mirrors `services.router.test.ts`'s `makeAdminDb`/`makeStaffDb` exactly.)

```ts
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
		transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
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

	it("does not throw FORBIDDEN for an in-scope branch-pinned category", async () => {
		const tenantDb = makeAdminDb({
			id: CATEGORY_ID,
			branchId: IN_SCOPE_BRANCH,
		});
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});
		// The branch guard must pass; the upsert may still resolve/reject on the
		// stubbed service call, but it must NOT be a FORBIDDEN branch rejection.
		await call(categoryCommissionRouter.upsert, validUpsertInput, {
			context: ctx,
		}).catch((err: { code?: string }) => {
			expect(err.code).not.toBe("FORBIDDEN");
		});
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

	it("does not throw FORBIDDEN for an org-wide (branchId=null) category", async () => {
		const tenantDb = makeAdminDb({ id: CATEGORY_ID, branchId: null });
		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		await call(categoryCommissionRouter.delete, {
			organizationId: ORG_ID,
			categoryId: CATEGORY_ID,
		}, { context: ctx }).catch((err: { code?: string }) => {
			expect(err.code).not.toBe("FORBIDDEN");
		});
	});
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd packages/api && bun test src/routers/category-commission.router.test.ts
```

Expected failure: the three "throws FORBIDDEN when the category is pinned to an out-of-scope branch" cases FAIL because the current handlers (lines 19-29, 73-130, 139-167) never load the category nor call `guardStoredBranchForContext` — `getByCategory` resolves to the (stubbed) config and `upsert`/`delete` proceed to the service stubs, so the `.rejects.toMatchObject({ code: "FORBIDDEN" })` assertions reject with "promise resolved instead of rejecting" / no FORBIDDEN. The in-scope/org-wide "passes" cases should already be green.

- [ ] **Step 3: Add the guard** (resolve the `service_categories` row via `getServiceCategoryById`, then `guardStoredBranchForContext(context, category.branchId)`. Mirror `serviceCategories.getById`. NOT_FOUND on a missing category, matching the mirror.)

**3a — Import edit.** The file currently imports (lines 4-10):

```ts
import { tenantProcedure } from "../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import { hasPermission } from "@avantej-core/services/permission.service";
import {
	getCategoryCommissionConfig,
	upsertCategoryCommissionConfig,
	deleteCategoryCommissionConfig,
} from "@avantej-core/services/category-commission.service";
```

Replace the guards import line and add `getServiceCategoryById` from the services barrel:

```ts
import { tenantProcedure } from "../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardStoredBranchForContext,
} from "../guards";
import { getServiceCategoryById } from "@avantej-core/services";
import { hasPermission } from "@avantej-core/services/permission.service";
import {
	getCategoryCommissionConfig,
	upsertCategoryCommissionConfig,
	deleteCategoryCommissionConfig,
} from "@avantej-core/services/category-commission.service";
```

(`getServiceCategoryById` is exported from the `@avantej-core/services` barrel — `packages/services/src/index.ts:495`.)

**3b — `getByCategory`.** Current lines 21-29:

```ts
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"category_commission_management",
			"read",
		);

		return getCategoryCommissionConfig(context.tenantDb, input.categoryId);
	});
```

Insert the resolve + guard between the permission check and the return:

```ts
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"category_commission_management",
			"read",
		);

		const category = await getServiceCategoryById(
			context.tenantDb,
			input.categoryId,
		);
		if (!category) {
			throw new ORPCError("NOT_FOUND", { message: "Category not found" });
		}
		await guardStoredBranchForContext(context, category.branchId);

		return getCategoryCommissionConfig(context.tenantDb, input.categoryId);
	});
```

**3c — `upsert`.** Current lines 95-100 (end of the permission block, before the totalBps check):

```ts
				"update",
			);
		}

		const totalBps = input.slots.reduce(
			(sum, s) => sum + s.weightageBasisPoints,
```

Insert the resolve + guard between the closing `}` of the permission block and the `totalBps` line:

```ts
				"update",
			);
		}

		const category = await getServiceCategoryById(
			context.tenantDb,
			input.categoryId,
		);
		if (!category) {
			throw new ORPCError("NOT_FOUND", { message: "Category not found" });
		}
		await guardStoredBranchForContext(context, category.branchId);

		const totalBps = input.slots.reduce(
			(sum, s) => sum + s.weightageBasisPoints,
```

**3d — `deleteConfig`.** Current lines 141-148:

```ts
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"category_commission_management",
			"delete",
		);

		try {
```

Insert the resolve + guard between the permission check and the `try`:

```ts
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"category_commission_management",
			"delete",
		);

		const category = await getServiceCategoryById(
			context.tenantDb,
			input.categoryId,
		);
		if (!category) {
			throw new ORPCError("NOT_FOUND", { message: "Category not found" });
		}
		await guardStoredBranchForContext(context, category.branchId);

		try {
```

(`ORPCError` is already imported at line 1; `assertOrgContextMatch` already runs first in each handler. `guardStoredBranchForContext` receives `category.branchId` — a STORED record value, satisfying the `check-tenant-perimeter.mjs` invariant that record branchIds use `guardStoredBranchForContext`, never `guardInputBranchForContext`.)

- [ ] **Step 4: Run test, verify PASS**

```bash
cd packages/api && bun test src/routers/category-commission.router.test.ts
```

All cases pass: out-of-scope branch → FORBIDDEN; in-scope and org-wide (`branchId=null`) → no FORBIDDEN. Then run the perimeter + type gates: `cd packages/api && bun run check-types` (from repo root: `bun check-types`) and confirm `node scripts/ci/check-tenant-perimeter.mjs` (repo root) stays green.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/category-commission.ts packages/api/src/routers/category-commission.router.test.ts
git commit -m "$(cat <<'EOF'
fix(api): enforce branch RBAC on categoryCommission get/upsert/delete

Resolve the service_categories row for input.categoryId and call
guardStoredBranchForContext(context, category.branchId) in getByCategory,
upsert, and delete, mirroring serviceCategories.getById. Prevents a member
from reading or mutating commission config for a category pinned to a branch
outside their accessibleNodeIds. Adds category-commission.router.test.ts
covering out-of-scope FORBIDDEN + in-scope/org-wide pass.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

Notes grounding this block in the real code:
- Mirror reference is `serviceCategories.getById` at `packages/api/src/routers/service-categories.ts:86-95` (load via `getServiceCategoryById`, NOT_FOUND if missing, then `await guardStoredBranchForContext(context, category.branchId)`).
- The named test file does NOT exist (`category-commission*.test.ts` returns no matches). It is created new as `category-commission.router.test.ts`, following the closest sibling `services.router.test.ts` (same `bun:test` imports, `call` from `@orpc/server`, `createMockContext`, `makeAdminDb` with `query.<table>.findFirst` mocks, literal v4-shaped UUID constants).
- `createMockContext` defaults `member.role: "admin"` and `accessibleNodeIds: ["node-root"]`; tests override `accessibleNodeIds` and rely on the admin permission fast-path (`roles.findFirst` → undefined) so the branch guard is the gate under test — same technique the sibling test documents in its header.
- `getServiceCategoryById` queries `tenantDb.query.serviceCategories.findFirst`, so the mock stubs `query.serviceCategories.findFirst` to return the category row carrying `branchId` (`service_categories.branch_id` is a nullable uuid → null = org-wide).

---

### Task 11: packageInstances.listAll — packages/api/src/routers/package-instances/lists.procedures.ts
**Files:**
- Modify (procedure): `packages/api/src/routers/package-instances/lists.procedures.ts:121-168` (the `listAll` handler)
- Modify (service): `packages/api/src/services/...` — add `listAllPackageInstances` to `packages/services/src/package-instance.service.ts` (mirrors `listMemberships` member-scope join, lines 307-417)
- Test: `packages/api/src/routers/package-instances.router.test.ts`

> Why a service: `package_instances` has **no `branchId` column** — scope is the owner `members.hierarchy_scope_id`. The current `listAll` handler does a raw `tenantDb.select().from(packageInstances)` with zero scope predicate, so any tenant member sees every org row. We mirror `listMemberships`: join `members m ON m.user_id = pi.client_id AND m.role = 'client'`, filter `m.hierarchy_scope_id = ANY(accessibleNodeIds)`, and short-circuit `[]` when `accessibleNodeIds` is empty. Because the fix moves to a SQL join executed via `tenantDb.execute(...)`, the test drives scope through `execute` (not the `select` chain or a `findFirst` record).

- [ ] **Step 1: Write the failing test** — append this block to `packages/api/src/routers/package-instances.router.test.ts`. It builds a tenantDb whose `execute` returns a row only when the SQL scope literal contains an in-scope node id, asserts an out-of-scope caller gets `[]`, and that an in-scope caller still gets the row. (FORBIDDEN-style enumeration is avoided here: `listAll` is a list endpoint, so out-of-scope correctly yields an empty list, matching `listMemberships`.)

```ts
// ─── listAll (tenant-scope isolation) ─────────────────────────────────────────
// listAll must scope rows to the owning member's hierarchy_scope_id ∈ accessibleNodeIds
// (mirrors listMemberships). package_instances has no branchId column. A caller whose
// accessibleNodeIds do not cover the owning branch must get [] (no cross-tenant leak),
// and an empty accessibleNodeIds (non-admin) short-circuits to [].

const IN_SCOPE_NODE = "11111111-1111-4111-8111-111111111111";
const OUT_OF_SCOPE_NODE = "22222222-2222-4222-8222-222222222222";

// tenantDb whose `execute` returns the package row only if the SQL text references
// IN_SCOPE_NODE — emulating the WHERE m.hierarchy_scope_id = ANY(...) predicate the
// service builds from accessibleNodeIds.
function makeScopedListDb() {
	return {
		execute: mock((q: { sql?: string } | Any) => {
			const text = typeof q === "string" ? q : (q?.sql ?? JSON.stringify(q));
			const visible = text.includes(IN_SCOPE_NODE);
			return Promise.resolve({
				rows: visible
					? [
							{
								id: PKG_ID,
								client_id: "client-1",
								customer_name: "Ahmad",
								service_id: SERVICE_ID,
								status: "active",
								source: "purchased",
								created_at: new Date(),
								hierarchy_scope_id: IN_SCOPE_NODE,
							},
						]
					: [],
			});
		}),
		// fallback select chain in case the handler path is partially migrated
		select: mock(() => ({
			from: mock(() => ({
				where: mock(() => ({
					orderBy: mock(() => ({ limit: mock(() => Promise.resolve([])) })),
				})),
			})),
		})),
	} as unknown as never;
}

const cpDbNoUsers = {
	select: mock(() => ({
		from: mock(() => ({ where: mock(() => Promise.resolve([])) })),
	})),
};

const listAllCtx = (tenantDb: unknown, accessibleNodeIds: string[]) =>
	createMockContext({
		tenantDb,
		member: {
			id: "m-staff",
			userId: "u-staff",
			role: "staff",
			status: "active",
			hierarchyScopeId: IN_SCOPE_NODE,
		},
		accessibleNodeIds,
		honoBindings: { controlPanelDb: cpDbNoUsers },
	});

describe("packageInstancesRouter.listAll (tenant isolation)", () => {
	it("returns [] when the owning branch is outside the caller's accessibleNodeIds", async () => {
		const ctx = listAllCtx(makeScopedListDb(), [OUT_OF_SCOPE_NODE]);
		const result = (await call(
			packageInstancesRouter.listAll,
			{ organizationId: ORG_ID },
			{ context: ctx },
		)) as unknown[];
		expect(result).toHaveLength(0);
	});

	it("short-circuits to [] when accessibleNodeIds is empty (non-admin)", async () => {
		const ctx = listAllCtx(makeScopedListDb(), []);
		const result = (await call(
			packageInstancesRouter.listAll,
			{ organizationId: ORG_ID },
			{ context: ctx },
		)) as unknown[];
		expect(result).toHaveLength(0);
	});

	it("returns the row when the owning branch is in scope", async () => {
		const ctx = listAllCtx(makeScopedListDb(), [IN_SCOPE_NODE]);
		const result = (await call(
			packageInstancesRouter.listAll,
			{ organizationId: ORG_ID },
			{ context: ctx },
		)) as Array<{ id: string }>;
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(PKG_ID);
	});
});
```

> If `Any` is not already imported/aliased in this test file, replace `Any` in `makeScopedListDb` with `any` (the file already uses `(r: any)`-style casts, so a bare `any` matches the file's lint posture). `ORG_ID`, `PKG_ID`, `SERVICE_ID` are the existing top-of-file constants (lines 13-16).

- [ ] **Step 2: Run test, verify FAIL**
  ```bash
  cd packages/api && bun test src/routers/package-instances.router.test.ts -t "listAll (tenant isolation)"
  ```
  Expected failure: the current handler (lines 139-144) runs `tenantDb.select().from(packageInstances)...` with no scope join, so it returns `[]` from the `select`-chain fallback for the in-scope case → the third assertion `expect(result).toHaveLength(1)` fails (got 0). The first two pass coincidentally, proving the scope predicate is absent.

- [ ] **Step 3: Add the guard** — two edits.

  **3a. New service** in `packages/services/src/package-instance.service.ts`. Add after `listMemberships` (after line 417's `countQuery`/the function close around line ~490). It mirrors the member-scope join and short-circuits empty:

  ```ts
  /**
   * List all package instances for the org, scoped to the owning member's
   * hierarchy_scope_id ∈ accessibleNodeIds. package_instances has no branchId;
   * scope is the owning client member (mirrors listMemberships).
   */
  export async function listAllPackageInstances(
  	controlPanelDb: ControlPanelDb,
  	tenantDb: TenantDb,
  	params: {
  		accessibleNodeIds: string[];
  		clientId?: string;
  		status?: string;
  		source?: string;
  		limit?: number;
  	},
  ): Promise<Array<Record<string, unknown> & { clientName: string | null }>> {
  	const { accessibleNodeIds, clientId, status, source, limit = 100 } = params;

  	if (accessibleNodeIds.length === 0) return [];
  	assertUuids(accessibleNodeIds, "listAllPackageInstances");

  	const nodeArrayLiteral = sql.raw(
  		`ARRAY[${accessibleNodeIds.map((id) => `'${id}'`).join(",")}]::uuid[]`,
  	);
  	const clientPredicate = clientId ? sql`AND pi.client_id = ${clientId}` : sql``;
  	const statusPredicate = status ? sql`AND pi.status = ${status}` : sql``;
  	const sourcePredicate = source ? sql`AND pi.source = ${source}` : sql``;

  	const result = await tenantDb.execute(sql`
  		SELECT pi.*, m.hierarchy_scope_id AS hierarchy_scope_id
  		FROM package_instances pi
  		JOIN members m ON m.user_id = pi.client_id AND m.role = 'client'
  		WHERE m.hierarchy_scope_id = ANY(${nodeArrayLiteral})
  			${clientPredicate}
  			${statusPredicate}
  			${sourcePredicate}
  		ORDER BY pi.created_at DESC
  		LIMIT ${limit}
  	`);
  	const rows = result.rows as Array<Record<string, unknown>>;

  	const clientIds = [
  		...new Set(
  			rows
  				.map((r) => r.client_id as string | null)
  				.filter((id): id is string => id != null),
  		),
  	];
  	const userRows =
  		clientIds.length > 0
  			? await controlPanelDb
  					.select({ id: user.id, name: user.name })
  					.from(user)
  					.where(inArray(user.id, clientIds))
  			: [];
  	const userMap = new Map(userRows.map((u) => [u.id, u.name]));

  	return rows.map((r) => ({
  		...r,
  		clientName: r.client_id ? (userMap.get(r.client_id as string) ?? null) : null,
  	}));
  }
  ```
  (`sql`, `assertUuids`, `user`, `inArray`, `ControlPanelDb`, `TenantDb` are already imported in this file — they are used by `listMemberships` above.)

  **3b. Rewrite the `listAll` handler** in `lists.procedures.ts` to route through the service. Replace the body from line 130 (`// Build filter conditions dynamically`) through line 167 (the `return rows.map(...)` close at line 168) with the service call. The import at line 1-4 must also pull in the new symbol:

  Current import (lines 1-4):
  ```ts
  import {
  	listMemberships,
  	listAssignedToMember,
  } from "@avantej-core/services/package-instance.service";
  ```
  Becomes:
  ```ts
  import {
  	listMemberships,
  	listAssignedToMember,
  	listAllPackageInstances,
  } from "@avantej-core/services/package-instance.service";
  ```

  Current handler body (lines 130-167), shown with the 3 surrounding lines that stay (the `assertOrgContextMatch`/`requirePermissionOrpc` block at 122-128 is unchanged, and the closing `}),` stays):
  ```ts
  			);

  			// Build filter conditions dynamically
  			const conditions = [];
  			if (input.clientId)
  				conditions.push(eq(packageInstances.clientId, input.clientId));
  			...
  			return rows.map((row: any) => ({
  				...row,
  				clientName: row.clientId ? (userMap.get(row.clientId) ?? null) : null,
  			}));
  		}),
  ```
  Replace everything between the `);` (close of `requirePermissionOrpc`, line 128) and the `}),` (line 168) with:
  ```ts
  			);

  			const controlPanelDb = getControlPanelDb(context);
  			return listAllPackageInstances(controlPanelDb, context.tenantDb, {
  				accessibleNodeIds: context.accessibleNodeIds ?? [],
  				clientId: input.clientId,
  				status: input.status,
  				source: input.source,
  				limit: input.limit,
  			});
  		}),
  ```
  After this edit, the now-unused imports `packageInstances`, `user`, `desc`, `and`, `eq`, `inArray` (lines 6-8) are only still needed if other procedures in the file use them — `listMemberships`/`listExpiring`/`listAssignedToMe` do not reference `packageInstances`/`user`/`desc`/`and`/`eq`/`inArray`, so remove those six from the imports (lines 6-8) to satisfy oxlint's no-unused. Keep `parseCursor`/`encodeCursor`/`ORPCError`/`z`/`tenantProcedure`/`requirePermissionOrpc`/`assertOrgContextMatch`/`getControlPanelDb`/`sourceSchema`/`statusSchema` — still used.

  > CI invariant: no `record.branchId` is passed to any input-guard here (there is no branchId at all); scope is enforced by the service's `m.hierarchy_scope_id = ANY(...)` predicate, so `check-tenant-perimeter.mjs` has nothing to flag.

- [ ] **Step 4: Run test, verify PASS**
  ```bash
  cd packages/api && bun test src/routers/package-instances.router.test.ts
  ```
  All three new `listAll (tenant isolation)` cases plus the existing `reject`/`confirmPayment` suites pass. Then type-check: `bun check-types` from repo root (confirms the new service signature + the trimmed imports compile).

- [ ] **Step 5: Commit**
  ```bash
  git add packages/api/src/routers/package-instances/lists.procedures.ts \
          packages/api/src/routers/package-instances.router.test.ts \
          packages/services/src/package-instance.service.ts
  git commit -m "fix(security): scope packageInstances.listAll to owner member hierarchy_scope_id

  listAll did a raw select with no RBAC predicate, leaking every org row to any
  tenant member. Route through new listAllPackageInstances service that joins the
  owning client member and filters hierarchy_scope_id ∈ accessibleNodeIds (mirrors
  listMemberships); short-circuits [] for empty accessibleNodeIds. No branchId
  column exists on package_instances.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 12: packageInstances.statusHistory — packages/api/src/routers/package-instances/history.procedures.ts
**Files:**
- Modify: `packages/api/src/routers/package-instances/history.procedures.ts:1-8` (imports) and `:28-36` (handler body, between `requirePermissionOrpc` and the `getPackageInstanceStatusHistory` call)
- Test: `packages/api/src/routers/package-instances/history.procedures.test.ts` (NEW — no test file exists for `history.procedures.ts`; the only sibling test is `client.procedures.test.ts`. This new file follows the conventions of `client.procedures.test.ts` + `../../../payouts.router.test.ts` permission-passing pattern.)

- [ ] **Step 1: Write the failing test** (full test code below)

The audit fix is the same load-instance → load-service → guard-on-`svc.branchId` pattern already proven in `lifecycle.procedures.ts` (`cancel`/`freeze`/`unfreeze`/`extend`). `statusHistory` is the only `package-instances` read that skips it, so a caller can enumerate instance IDs belonging to branches outside their scope and get history rows back (or an empty page) instead of `NOT_FOUND`. The mock tenantDb below combines the payouts-test permission trick (`roles`/`permissions`/`rolePermissions.findFirst` all `undefined` → default admin member passes `requirePermissionOrpc`) with `packageInstances.findFirst` / `services.findFirst` stubs and a `.select()...limit()` chain for the in-scope path.

```ts
/**
 * package-instances history procedures — statusHistory branch-scope guard.
 *
 * statusHistory loads a package instance by id and returns its status-change
 * audit trail. Without a branch-scope check, a member can pass an instanceId
 * pinned to a branch OUTSIDE their accessibleNodeIds and read it (enumeration
 * oracle). The fix loads instance → service and runs
 * guardStoredBranchForContext(context, svc.branchId), matching the lifecycle
 * procedures. These tests prove the guard fires (out-of-scope → FORBIDDEN),
 * that a missing instance is NOT_FOUND, and that an in-scope/org-wide service
 * still passes through to the history query.
 *
 * Permission passing: the mock tenantDb's role/permission lookups all miss, so
 * hasPermission falls back to the `member.role === "admin"` rule and the
 * default mock member (admin) clears requirePermissionOrpc — same trick as
 * payouts.router.test.ts. We do NOT mock.module @avantej-core/services
 * (documented subpath-mock conflict): the in-scope test lets the real history
 * query run against a select-chain stub that returns [].
 *
 * Run: cd packages/api && bun test src/routers/package-instances/history.procedures.test.ts
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { packageInstancesHistoryProcedures } from "./history.procedures";
import { createMockContext } from "../../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PKG_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SVC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IN_SCOPE_BRANCH = "node-root"; // matches createMockContext default accessibleNodeIds
const OUT_OF_SCOPE_BRANCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/**
 * Mock tenantDb for the history procedure.
 * - query.roles/permissions/rolePermissions.findFirst → undefined  (admin fallback passes the permission guard)
 * - query.packageInstances.findFirst → the loaded instance (or undefined for NOT_FOUND)
 * - query.services.findFirst → the loaded service carrying branchId (or undefined)
 * - select().from().where().orderBy().limit() → [] (history query when guard passes)
 */
function makeHistoryDb(opts: {
	instance: unknown;
	service: unknown;
}) {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			packageInstances: {
				findFirst: mock(() => Promise.resolve(opts.instance)),
			},
			services: {
				findFirst: mock(() => Promise.resolve(opts.service)),
			},
		},
		// getPackageInstanceStatusHistory's fluent chain → resolves to []
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: () => ({
						limit: () => Promise.resolve([]),
					}),
				}),
			}),
		}),
	} as unknown as never;
}

describe("packageInstances.statusHistory — branch-scope guard", () => {
	it("rejects an instance whose service branch is OUTSIDE the caller's accessibleNodeIds → FORBIDDEN", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
			tenantDb: makeHistoryDb({
				instance: { id: PKG_ID, serviceId: SVC_ID },
				service: { id: SVC_ID, branchId: OUT_OF_SCOPE_BRANCH },
			}),
		});

		await expect(
			call(
				packageInstancesHistoryProcedures.statusHistory,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("returns NOT_FOUND for a missing instance (no enumeration of a foreign id)", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
			tenantDb: makeHistoryDb({ instance: undefined, service: undefined }),
		});

		await expect(
			call(
				packageInstancesHistoryProcedures.statusHistory,
				{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("passes for an in-scope service branch and reaches the history query", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
			tenantDb: makeHistoryDb({
				instance: { id: PKG_ID, serviceId: SVC_ID },
				service: { id: SVC_ID, branchId: IN_SCOPE_BRANCH },
			}),
		});

		const res = await call(
			packageInstancesHistoryProcedures.statusHistory,
			{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
			{ context: ctx },
		);

		expect(res).toEqual({ rows: [], nextCursor: null });
	});

	it("passes for an org-wide service (null branchId) — stored null is allowed", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_BRANCH],
			tenantDb: makeHistoryDb({
				instance: { id: PKG_ID, serviceId: SVC_ID },
				service: { id: SVC_ID, branchId: null },
			}),
		});

		const res = await call(
			packageInstancesHistoryProcedures.statusHistory,
			{ organizationId: ORG_ID, packageInstanceId: PKG_ID },
			{ context: ctx },
		);

		expect(res).toEqual({ rows: [], nextCursor: null });
	});
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd packages/api && bun test src/routers/package-instances/history.procedures.test.ts
```

Expected failure (pre-fix): the current handler has no `findFirst` calls and no branch guard. The first test (`OUTSIDE → FORBIDDEN`) FAILS — the procedure never inspects the service branch, so it falls through to the history query and resolves `{ rows: [], nextCursor: null }` instead of throwing `FORBIDDEN` (assertion error: "expected promise to reject"). The `NOT_FOUND` test also FAILS — the current code never loads the instance, so a missing id resolves an empty page instead of throwing `NOT_FOUND`. The two positive tests already pass (the chain returns `[]`).

- [ ] **Step 3: Add the guard**

Edit 1 — imports. The procedure already imports `assertOrgContextMatch, requirePermissionOrpc` from `"../../guards"`; add `guardStoredBranchForContext`, plus the schema tables and `eq`, plus `ORPCError`. Change lines 1-8:

```ts
import { getPackageInstanceStatusHistory } from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { inArray, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	requirePermissionOrpc,
	guardStoredBranchForContext,
} from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";
```

(The original `import { inArray } from "drizzle-orm";` becomes `import { inArray, eq } from "drizzle-orm";`; the `assertOrgContextMatch, requirePermissionOrpc` import gains `guardStoredBranchForContext`; the two schema imports and the `ORPCError` import are new.)

Edit 2 — insert the load-and-guard block in the handler, immediately after the existing `requirePermissionOrpc(...)` await (which ends at line 27) and BEFORE `const limit = input.limit;` (line 29). Surrounding context shows exactly where:

```ts
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"package_management",
				"read",
			);

			// Branch-scope: load instance → service, guard against accessibleNodeIds.
			// A foreign instanceId must surface as NOT_FOUND, not an empty page
			// (closes the enumeration oracle). Matches the lifecycle procedures.
			const instance = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.packageInstanceId),
			});
			if (!instance) {
				throw new ORPCError("NOT_FOUND", {
					message: "Package instance not found",
				});
			}
			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, instance.serviceId),
			});
			await guardStoredBranchForContext(context, svc?.branchId ?? null);

			const limit = input.limit;
```

Note: pass `svc?.branchId ?? null` (a STORED record value) to `guardStoredBranchForContext` — never `guardInputBranchForContext` (the CI `check-tenant-perimeter.mjs` gate flags a record branchId passed to the input guard). `guardStoredBranchForContext` treats null/undefined as an org-wide service (allowed) and throws `FORBIDDEN` only when the branch is set and not in `accessibleNodeIds`.

- [ ] **Step 4: Run test, verify PASS**

```bash
cd packages/api && bun test src/routers/package-instances/history.procedures.test.ts
```

All four tests pass: out-of-scope branch → `FORBIDDEN`, missing instance → `NOT_FOUND`, in-scope branch and null branch → `{ rows: [], nextCursor: null }`. Also run the directory's existing test to confirm no regression: `cd packages/api && bun test src/routers/package-instances/`.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/package-instances/history.procedures.ts \
        packages/api/src/routers/package-instances/history.procedures.test.ts
git commit -m "fix(package-instances): branch-scope guard on statusHistory (closes enumeration oracle)

statusHistory returned an instance's status-change audit trail without
checking that its service branch is within the caller's accessibleNodeIds,
letting a member enumerate foreign instance ids. Load instance -> service and
run guardStoredBranchForContext(context, svc.branchId); a missing instance now
returns NOT_FOUND instead of an empty page. Matches the lifecycle procedures.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Follow-up (separate, optional — not part of Phase 0 green gate)

**Extend the tenant-perimeter CI gate to require guard COVERAGE.** Today `scripts/ci/check-tenant-perimeter.mjs` only checks that guards, *when used*, are used correctly + imported — it does not require a branch-scoped by-id read to call a guard at all. That coverage gap is exactly why these 17 slipped. A coverage check (flag `findFirst`/`getXById` reads returning a row with `branchId` in a router file that never calls a `guard*` for it) needs heuristics/AST and a curated allowlist, so it warrants its own small design rather than placeholder code here. Track separately.

## Self-review notes

- Spec coverage: Tasks 1–12 cover all 17 confirmed leak procedures from spec §5.2 (salesOrders getById+statusHistory; payouts previewBatch/runBatch/processForRecipient; commissionSplits liabilitySummary+exportLiabilityCsv; packageInstances getById/paymentProofs/listAll/statusHistory; refunds.getById; members.newToday; appointments.statusHistory; invoices getById/getDetail/paymentStatusHistory; categoryCommission getByCategory/upsert/delete).
- The matrix-flagged `trusts-fixed-scope` set (cancelledSales, households, commissionCycle) from spec §5.2 is NOT in these 12 tasks — re-audit + convert before enabling the switcher (tracked in spec, not blocking Phase 0 read-leak closure).
