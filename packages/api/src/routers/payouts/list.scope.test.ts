/**
 * Payouts list — hierarchy scope (subtree-expansion) guard tests.
 *
 * `payouts.list` accepts an OPTIONAL `branchId` (which may be a NON-LEAF
 * country/region/state node). When supplied it is expanded to its accessible
 * subtree of leaf branch ids via `resolveScopeNodeIds`, then used to narrow the
 * branch filter:
 *   - non-admins: the existing RBAC predicate's `inArray(...)` sets switch from
 *     `context.accessibleNodeIds` to the (equal-or-narrower) `scopeIds`;
 *   - admins: org-wide by default, but narrowed to the picked subtree when a
 *     `branchId` is supplied.
 * With NO `branchId`, behavior is byte-for-byte unchanged (no scope expansion,
 * admins stay org-wide).
 *
 * TEST-ISOLATION NOTE: this file deliberately does NOT use `mock.module` on the
 * shared `@avantej-core/services` barrel. A top-level, unrestored `mock.module`
 * replaces the barrel for the WHOLE `bun test` process and poisons sibling scope
 * tests that rely on the real `resolveScopeNodeIds` / `getDescendantNodeIds`.
 * Instead we let the REAL helpers run and stub only `context.tenantDb` at two
 * seams (mirroring routers/appointments/list.scope.test.ts):
 *   - `execute(sql)` → the recursive descendant CTE result (`{ rows: [{ id }] }`),
 *     consumed by `getDescendantNodeIds` inside `resolveScopeNodeIds`.
 *   - `select()…` → the payout-rows query (resolved to `[]` so the procedure
 *     short-circuits before the name-enrichment lookups).
 *
 * Permission uses the admin fast-path (`roles.findFirst → undefined` +
 * `member.role === "admin"`); the non-admin case stubs `roles.findFirst` to a
 * priority>=100 role so the permission gate PASSES and any FORBIDDEN can only
 * originate from the branch guard.
 *
 * Row-correctness (which payout rows survive the SQL branch filter) requires a
 * live Postgres, so it is intentionally NOT asserted here — these tests cover
 * the API-boundary guard + scope-expansion wiring DB-free.
 *
 * NOTE: depth is ../../ here because this file lives in routers/payouts/.
 *
 * Run: bun test src/routers/payouts/list.scope.test.ts
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { createMockContext } from "../../test-utils/mock-context";
import { payoutsReadProcedures } from "./read.procedures";

// Matches createMockContext's default organizationId so assertOrgContextMatch passes.
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// A non-leaf scope node (e.g. a region/state) the caller picks.
const REGION = "11111111-1111-4111-8111-111111111111";
// Leaf branches under REGION.
const LEAF_A = "22222222-2222-4222-8222-222222222222";
const LEAF_B = "33333333-3333-4333-8333-333333333333";
// A node entirely outside the caller's accessible ceiling.
const OUT_OF_SCOPE = "99999999-9999-4999-8999-999999999999";

const NON_ADMIN_MEMBER = {
	id: "member-mgr",
	userId: "user-mgr",
	role: "manager" as const,
	status: "active" as const,
	hierarchyScopeId: REGION,
	roleId: null,
};

/**
 * Build a tenantDb covering exactly what payouts.list touches:
 *   - `query.roles.findFirst` → undefined by default (requirePermission admin
 *     fast-path); override via `roleFindFirst` to pass the gate for a non-admin.
 *   - `execute(sql)` → recursive descendant CTE result, consumed by
 *     getDescendantNodeIds inside resolveScopeNodeIds.
 *   - `select()…` → the payout-rows query; resolves to `[]` so the procedure
 *     returns early (no member/controlPanel enrichment selects needed).
 */
function makeListDb({
	descendantIds = [],
	roleFindFirst,
}: {
	descendantIds?: string[];
	roleFindFirst?: () => Promise<unknown>;
}) {
	const execute = mock(() =>
		Promise.resolve({ rows: descendantIds.map((id) => ({ id })) }),
	);
	const select = mock(() => {
		const chain: Record<string, unknown> = {
			from: () => chain,
			leftJoin: () => chain,
			where: () => chain,
			orderBy: () => chain,
			limit: () => chain,
			then: (resolve: (v: unknown) => unknown) =>
				Promise.resolve([]).then(resolve),
		};
		return chain;
	});

	return {
		query: {
			roles: {
				findFirst: roleFindFirst
					? mock(roleFindFirst)
					: mock(() => Promise.resolve(undefined)),
			},
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
		execute,
		select,
		__execute: execute,
		__select: select,
	} as unknown as never;
}

type DbProbe = {
	__execute: { mock: { calls: unknown[] } };
	__select: { mock: { calls: unknown[] } };
};

describe("payoutsRouter.list — hierarchy scope", () => {
	it("rejects FORBIDDEN when branchId is outside accessibleNodeIds (admin, guard before query)", async () => {
		const tenantDb = makeListDb({ descendantIds: [] });
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			accessibleNodeIds: [REGION, LEAF_A, LEAF_B],
		});

		await expect(
			call(
				payoutsReadProcedures.list,
				{ organizationId: ORG_ID, branchId: OUT_OF_SCOPE },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		// Guard short-circuits before the row query (select) and the scope
		// expansion (execute / descendant CTE) ever run.
		const probe = tenantDb as unknown as DbProbe;
		expect(probe.__select.mock.calls.length).toBe(0);
		expect(probe.__execute.mock.calls.length).toBe(0);
	});

	it("rejects FORBIDDEN for a non-admin too (guard is role-agnostic)", async () => {
		// The manager's role passes the permission gate (priority>=100), so the
		// FORBIDDEN can ONLY come from the branch guard — not the permission check.
		const tenantDb = makeListDb({
			descendantIds: [],
			roleFindFirst: () =>
				Promise.resolve({ id: "role-mgr", name: "manager", priority: 100 }),
		});
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			member: NON_ADMIN_MEMBER,
			accessibleNodeIds: [REGION, LEAF_A, LEAF_B],
		});

		await expect(
			call(
				payoutsReadProcedures.list,
				{ organizationId: ORG_ID, branchId: OUT_OF_SCOPE },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		const probe = tenantDb as unknown as DbProbe;
		expect(probe.__select.mock.calls.length).toBe(0);
		expect(probe.__execute.mock.calls.length).toBe(0);
	});

	it("no branchId → NO scope expansion (no-scope path unchanged)", async () => {
		// CRITICAL: with no branchId the descendant CTE (resolveScopeNodeIds) must
		// NEVER run, and the row query runs exactly once — proving the no-scope
		// path is byte-for-byte unchanged from today's org-wide/full-ceiling read.
		const tenantDb = makeListDb({ descendantIds: ["node-root"] });
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			accessibleNodeIds: [REGION],
		});

		const result = await call(
			payoutsReadProcedures.list,
			{ organizationId: ORG_ID },
			{ context: ctx },
		);

		expect(result).toEqual([]); // select stub → [] → early return

		const probe = tenantDb as unknown as DbProbe;
		expect(probe.__execute.mock.calls.length).toBe(0); // no subtree expansion
		expect(probe.__select.mock.calls.length).toBe(1); // row query still ran once
	});

	it("in-scope non-leaf branchId (admin) → expands subtree and reaches the query (not FORBIDDEN)", async () => {
		// REGION expands (via the REAL resolveScopeNodeIds → getDescendantNodeIds
		// recursive CTE stub) to its subtree; the guard passes and the admin
		// narrowing branch pushes a scoped predicate. Row filtering itself is SQL,
		// so we only assert the wiring ran (execute once) and no FORBIDDEN.
		const tenantDb = makeListDb({ descendantIds: [REGION, LEAF_A, LEAF_B] });
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			accessibleNodeIds: [REGION, LEAF_A, LEAF_B],
		});

		const result = await call(
			payoutsReadProcedures.list,
			{ organizationId: ORG_ID, branchId: REGION },
			{ context: ctx },
		);

		expect(result).toEqual([]);

		const probe = tenantDb as unknown as DbProbe;
		// The recursive descendant CTE was actually invoked (real subtree expansion,
		// not a stubbed short-circuit), then the row query ran once.
		expect(probe.__execute.mock.calls.length).toBe(1);
		expect(probe.__select.mock.calls.length).toBe(1);
	});
});
