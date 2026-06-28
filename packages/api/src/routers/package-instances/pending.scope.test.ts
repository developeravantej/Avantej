/**
 * package-instances.listPending — scope subtree expansion + RBAC isolation.
 *
 * listPending accepts a `branchId` that may now be ANY hierarchy node (a
 * country/region/state, not just a leaf branch). It converts that node to its
 * accessible leaf subtree via resolveScopeNodeIds before filtering pending
 * packages, so a non-leaf scope returns its branches' rows instead of zero.
 *
 * Tests:
 *  1. Out-of-scope branchId → FORBIDDEN (guardBranchAccessible fires before any
 *     DB query, so this passes without a live DB).
 *  2. Non-leaf scope (admin / empty ceiling) → resolveScopeNodeIds expands the
 *     node via getDescendantNodeIds (tenantDb.execute), proving the equality→
 *     subtree conversion is wired. Old code used `[input.branchId]` with NO DB
 *     hit, so the recorded `execute` call is the proof.
 */

import { describe, expect, it } from "bun:test";
import { call } from "@orpc/server";
import { packageInstancesPendingProcedures } from "./pending.procedures";
import { createMockContext } from "../../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PKG_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SVC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
// Region node the admin picks (a non-leaf scope). branchId is validated as a
// UUID by the input schema, so this must be a real UUID even though it stands
// in for a region. In the positive test it expands to child branches.
const REGION_NODE = "33333333-3333-4333-8333-333333333333";
const BRANCH_A = "11111111-1111-4111-8111-111111111111";
const BRANCH_B = "22222222-2222-4222-8222-222222222222";
// A node OUTSIDE the caller's accessible ceiling.
const OUT_OF_SCOPE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("packageInstances.listPending — scope isolation", () => {
	it("out-of-scope branchId → FORBIDDEN (guard fires before any DB query)", async () => {
		const ctx = createMockContext({
			// default accessibleNodeIds is ["node-root"], which EXCLUDES OUT_OF_SCOPE.
			// guardBranchAccessible throws before resolveScopeNodeIds / the query runs.
			// tenantProcedure requires a truthy tenantDb to reach the handler, but it is
			// never queried — the guard throws first, so a bare stub suffices.
			// biome-ignore lint/suspicious/noExplicitAny: unused tenantDb stub
			tenantDb: {} as any,
		});

		await expect(
			call(
				packageInstancesPendingProcedures.listPending,
				{ organizationId: ORG_ID, branchId: OUT_OF_SCOPE },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

// ---- positive: non-leaf scope expands to its subtree (admin / empty ceiling) ----

type ExecuteCall = { sql: unknown };

/**
 * tenantDb stub for the expansion path.
 *  - execute(sql)  → getDescendantNodeIds' recursive CTE → region + 2 branches.
 *  - select chain  → main query terminates in .limit() (returns mainRows);
 *                    preferredTimes query terminates by awaiting .orderBy()
 *                    (the builder is thenable → resolves timesRows).
 */
function makeExpansionDb(opts: {
	descendants: string[];
	mainRows: unknown[];
	timesRows?: unknown[];
	executeCalls: ExecuteCall[];
}) {
	const timesRows = opts.timesRows ?? [];
	const builder: Record<string, unknown> = {};
	builder.select = () => builder;
	builder.from = () => builder;
	builder.leftJoin = () => builder;
	builder.where = () => builder;
	builder.orderBy = () => builder;
	builder.limit = () => Promise.resolve(opts.mainRows);
	// Thenable: awaited directly by the preferredTimes query (after .orderBy()).
	builder.then = (resolve: (v: unknown) => unknown) => resolve(timesRows);

	// biome-ignore lint/suspicious/noExplicitAny: loose test stub
	return {
		execute: (sql: unknown) => {
			opts.executeCalls.push({ sql });
			return Promise.resolve({
				rows: opts.descendants.map((id) => ({ id })),
			});
		},
		select: builder.select,
	} as any;
}

describe("packageInstances.listPending — non-leaf scope expansion", () => {
	it("expands a non-leaf scope node to its subtree via getDescendantNodeIds", async () => {
		const executeCalls: ExecuteCall[] = [];
		const ctx = createMockContext({
			// admin org-wide: empty ceiling → resolveScopeNodeIds returns the FULL
			// subtree (region + branches), proving expansion beyond the picked node.
			accessibleNodeIds: [],
			// minimal control-panel db; not queried because clientId/preferredTrainerId
			// are null below, but getControlPanelDb() is still called.
			honoBindings: { controlPanelDb: {} },
			tenantDb: makeExpansionDb({
				executeCalls,
				descendants: [REGION_NODE, BRANCH_A, BRANCH_B],
				mainRows: [
					{
						id: PKG_ID,
						clientId: null,
						serviceId: SVC_ID,
						totalPrice: 30000,
						creditsTotal: 3,
						createdAt: new Date("2026-06-01T00:00:00Z"),
						preferredTrainerId: null,
						serviceName: "Body Massage 60min",
						branchId: BRANCH_A,
						paymentMethod: "cash",
						paymentStatus: "paid",
						approvedAt: null,
						updatedAt: null,
					},
				],
			}),
		});

		const res = await call(
			packageInstancesPendingProcedures.listPending,
			{ organizationId: ORG_ID, branchId: REGION_NODE },
			{ context: ctx },
		);

		// The recursive-CTE expansion ran (old equality code made NO DB call here).
		expect(executeCalls.length).toBeGreaterThan(0);
		// The pending row from a CHILD branch (BRANCH_A) is returned — i.e. the
		// non-leaf scope surfaced its descendant branch's package.
		expect(res).toHaveLength(1);
		expect(res[0].id).toBe(PKG_ID);
		expect(res[0].branchId).toBe(BRANCH_A);
	});
});
