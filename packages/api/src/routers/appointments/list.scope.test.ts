/**
 * Appointments list — hierarchy scope (subtree-expansion) guard tests.
 *
 * `list` expands an explicit `branchId` (which may be a NON-LEAF country/region/
 * state node) to its accessible subtree of leaf branch ids via
 * `resolveScopeNodeIds`, then post-filters rows by that set. Picking a parent
 * node returns its branches' rows instead of zero.
 *
 * TEST-ISOLATION NOTE: this file deliberately does NOT use `mock.module` on the
 * shared `@avantej-core/services` barrel. A top-level, unrestored `mock.module`
 * replaces the barrel for the WHOLE `bun test` process and poisons sibling scope
 * tests (e.g. members/list.scope.test.ts) that rely on the real
 * `resolveScopeNodeIds` / `getDescendantNodeIds`. Instead we let the REAL helpers
 * run and stub only `context.tenantDb` at two seams — mirroring the clean style
 * in `routers/members/list.scope.test.ts`:
 *   - `execute(sql)` → the recursive descendant CTE result (`{ rows: [{ id }] }`),
 *     consumed by `getDescendantNodeIds` inside `resolveScopeNodeIds` (and inside
 *     `resolveAccessibleNodeIds` when the caller's ceiling is empty).
 *   - `select()…` → the FIRST call returns the base appointment rows fetched by
 *     `listAppointmentsWithRecurrence`; every later call (materialized children +
 *     name-enrichment lookups) resolves to `[]`.
 *
 * Three behaviours are covered without a live DB:
 *   1. Out-of-scope branchId → FORBIDDEN. The explicit `guardBranchAccessible`
 *      throws ahead of any row query / scope expansion (no select, no execute).
 *   2. In-scope non-leaf scope → rows whose branchId is in the expanded subtree
 *      are kept; a sibling leaf outside the subtree is dropped.
 *   3. Empty scope expansion (org-wide admin, no branchId) → no branch post-filter
 *      (all rows returned).
 *
 * Permission uses the admin fast-path: `roles.findFirst → undefined` +
 * `member.role === "admin"` grants `appointment_management:read` without RBAC.
 *
 * NOTE: depth is ../../ here because this file lives in routers/appointments/.
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { createMockContext } from "../../test-utils/mock-context";
import { appointmentsListProcedures } from "./list.procedures";

// Matches createMockContext's default organizationId so assertOrgContextMatch passes.
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// A non-leaf scope node (e.g. a region/state) the caller picks.
const REGION = "11111111-1111-4111-8111-111111111111";
// Leaf branches under REGION.
const LEAF_A = "22222222-2222-4222-8222-222222222222";
const LEAF_B = "33333333-3333-4333-8333-333333333333";
// A leaf NOT under REGION (sibling subtree) — must be excluded.
const LEAF_C = "44444444-4444-4444-8444-444444444444";
// A node entirely outside the caller's accessible ceiling.
const OUT_OF_SCOPE = "99999999-9999-4999-8999-999999999999";

function makeRow(id: string, branchId: string) {
	return {
		id,
		branchId,
		status: "confirmed",
		serviceId: null,
		trainerId: null,
		userId: null,
		customerName: "Walk-in",
		// listAppointmentsWithRecurrence treats these as standalone (non-recurring)
		// base rows and sorts by startTime.
		isRecurring: false,
		recurringParentId: null,
		startTime: new Date("2026-01-01T10:00:00.000Z"),
		isVirtual: false,
		parentId: null,
	};
}

/**
 * Build a tenantDb covering exactly what appointments.list touches:
 *   - `query.roles.findFirst → undefined` (requirePermission admin fast-path).
 *   - `execute(sql)` → recursive descendant CTE result, consumed by
 *     getDescendantNodeIds (inside resolveScopeNodeIds and/or
 *     resolveAccessibleNodeIds).
 *   - `select()…` → FIRST call resolves the base appointment rows (the row-fetch
 *     seam inside listAppointmentsWithRecurrence); later calls (materialized
 *     children + appointmentStaff/name enrichment) resolve to [].
 *
 * Rows carry a denormalized `customerName`, so the cross-DB user-name lookup is
 * skipped — no controlPanelDb needed.
 */
function makeListDb({
	baseRows,
	descendantIds,
}: {
	baseRows: Array<Record<string, unknown>>;
	descendantIds: string[];
}) {
	const execute = mock(() =>
		Promise.resolve({ rows: descendantIds.map((id) => ({ id })) }),
	);

	let selectCall = 0;
	const select = mock(() => {
		selectCall += 1;
		const rows = selectCall === 1 ? baseRows : [];
		const chain: Record<string, unknown> = {
			from: mock(() => chain),
			where: mock(() => chain),
			leftJoin: mock(() => chain),
			orderBy: mock(() => chain),
			limit: mock(() => chain),
			then: (resolve: (v: unknown) => unknown) =>
				Promise.resolve(rows).then(resolve),
		};
		return chain;
	});

	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
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

describe("appointmentsRouter.list — hierarchy scope", () => {
	it("rejects FORBIDDEN when branchId is outside accessibleNodeIds (guard before query)", async () => {
		const tenantDb = makeListDb({ baseRows: [], descendantIds: [] });
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			accessibleNodeIds: [REGION, LEAF_A, LEAF_B],
		});

		await expect(
			call(
				appointmentsListProcedures.list,
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

	it("returns rows across the subtree when a non-leaf node is picked", async () => {
		// REGION expands (via the real resolveScopeNodeIds → getDescendantNodeIds
		// recursive CTE stub) to its leaves; a sibling leaf (LEAF_C) is excluded.
		const tenantDb = makeListDb({
			baseRows: [
				makeRow("appt-a", LEAF_A),
				makeRow("appt-b", LEAF_B),
				makeRow("appt-c", LEAF_C),
			],
			descendantIds: [REGION, LEAF_A, LEAF_B],
		});
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			accessibleNodeIds: [REGION, LEAF_A, LEAF_B],
		});

		const result = await call(
			appointmentsListProcedures.list,
			{ organizationId: ORG_ID, branchId: REGION },
			{ context: ctx },
		);

		// The recursive descendant CTE was actually invoked (real subtree expansion,
		// not a stubbed short-circuit).
		const probe = tenantDb as unknown as DbProbe;
		expect(probe.__execute.mock.calls.length).toBe(1);
		// LEAF_A + LEAF_B kept (subtree); LEAF_C (sibling) dropped.
		const branchIds = result.map((r) => r.branchId).sort();
		expect(branchIds).toEqual([LEAF_A, LEAF_B].sort());
	});

	it("applies no branch filter when scope expansion yields an empty set (org-wide admin)", async () => {
		// accessibleNodeIds=[] models an org-wide admin: resolveAccessibleNodeIds
		// falls through to getDescendantNodeIds(member.hierarchyScopeId) — stubbed
		// non-empty so listAppointmentsWithRecurrence still fetches rows — while
		// resolveScopeNodeIds(undefined, []) returns [] → no branch post-filter.
		const tenantDb = makeListDb({
			baseRows: [makeRow("appt-a", LEAF_A), makeRow("appt-c", LEAF_C)],
			descendantIds: ["node-root"],
		});
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			accessibleNodeIds: [],
		});

		const result = await call(
			appointmentsListProcedures.list,
			{ organizationId: ORG_ID },
			{ context: ctx },
		);

		// Empty scopeIds → no post-filter → both rows returned.
		expect(result.map((r) => r.branchId).sort()).toEqual(
			[LEAF_A, LEAF_C].sort(),
		);
	});
});
