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
function makeHistoryDb(opts: { instance: unknown; service: unknown }) {
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
			// controlPanelDb binding present so getControlPanelDb (called after the
			// guard) does not throw INTERNAL_SERVER_ERROR first — keeps the new
			// branch-scope guard the deciding factor. Same pattern as
			// sales-orders/query.procedures.test.ts.
			honoBindings: { controlPanelDb: {} },
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
			honoBindings: { controlPanelDb: {} },
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
			honoBindings: { controlPanelDb: {} },
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
			honoBindings: { controlPanelDb: {} },
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
