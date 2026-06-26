/**
 * Analytics SERIES routers — optional branchId scope guard.
 *
 * The 4 series procs (getMemberCountSeries / getChurnSeries / getLtvSeries /
 * getClassFillRateSeries) gained an OPTIONAL `branchId` input that narrows the
 * accessible node set to the picked node's subtree (∩ ceiling). These assertions
 * are DB-free:
 *   - An out-of-scope branchId is rejected by `guardBranchAccessible` BEFORE any
 *     query (or any `resolveScopeNodeIds` DB walk) runs → FORBIDDEN.
 *   - With NO branchId the proc behaves exactly as before: `resolveScopeNodeIds`
 *     is never invoked (no DB hit), and the service receives the verbatim
 *     `accessibleNodeIds` ceiling. No regression.
 */

import { describe, expect, it, mock, beforeEach } from "bun:test";
import { call } from "@orpc/server";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OUT_OF_SCOPE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const mockGetMemberCountSeries = mock(() => Promise.resolve([]));
const mockGetChurnSeries = mock(() => Promise.resolve([]));
const mockGetLtvSeries = mock(() => Promise.resolve([]));
const mockGetClassFillRateSeries = mock(() => Promise.resolve([]));

mock.module("@avantej-core/services/analytics.service", () => ({
	getDashboardKpis: mock(() => Promise.resolve({})),
	getStaffPerformance: mock(() => Promise.resolve([])),
	getRevenueSeries: mock(() => Promise.resolve([])),
	getMemberCountSeries: mockGetMemberCountSeries,
	getChurnSeries: mockGetChurnSeries,
	getLtvSeries: mockGetLtvSeries,
	getClassFillRateSeries: mockGetClassFillRateSeries,
}));

import { analyticsRouter } from "./analytics";

// Admin member + a DB stub whose role/permission lookups resolve to undefined:
// `requirePermissionOrpc` bypasses for the admin role without a real query.
function makeAdminDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
	} as unknown as never;
}

const SERIES = [
	{
		name: "getMemberCountSeries",
		proc: analyticsRouter.getMemberCountSeries,
		serviceMock: mockGetMemberCountSeries,
	},
	{
		name: "getChurnSeries",
		proc: analyticsRouter.getChurnSeries,
		serviceMock: mockGetChurnSeries,
	},
	{
		name: "getLtvSeries",
		proc: analyticsRouter.getLtvSeries,
		serviceMock: mockGetLtvSeries,
	},
	{
		name: "getClassFillRateSeries",
		proc: analyticsRouter.getClassFillRateSeries,
		serviceMock: mockGetClassFillRateSeries,
	},
] as const;

describe("analyticsRouter series — optional branchId scope", () => {
	beforeEach(() => {
		mockGetMemberCountSeries.mockClear();
		mockGetChurnSeries.mockClear();
		mockGetLtvSeries.mockClear();
		mockGetClassFillRateSeries.mockClear();
	});

	for (const { name, proc, serviceMock } of SERIES) {
		it(`${name}: rejects branchId outside accessibleNodeIds (FORBIDDEN)`, async () => {
			const ctx = createMockContext({
				tenantDb: makeAdminDb(),
				organizationId: ORG_ID,
				accessibleNodeIds: [BRANCH_ID],
			});

			await expect(
				call(
					proc,
					{ organizationId: ORG_ID, days: 30, branchId: OUT_OF_SCOPE },
					{ context: ctx },
				),
			).rejects.toMatchObject({ code: "FORBIDDEN" });

			// Guard fires before the service is ever reached.
			expect(serviceMock).not.toHaveBeenCalled();
		});

		it(`${name}: runs with NO branchId (no regression, DB-free)`, async () => {
			const ctx = createMockContext({
				tenantDb: makeAdminDb(),
				organizationId: ORG_ID,
				accessibleNodeIds: [BRANCH_ID],
			});

			await call(proc, { organizationId: ORG_ID, days: 30 }, { context: ctx });

			// No branchId → resolveScopeNodeIds is never called; the service gets
			// the verbatim ceiling, exactly as before the scope param was added.
			expect(serviceMock).toHaveBeenCalledTimes(1);
			expect(serviceMock.mock.calls[0][1]).toMatchObject({
				days: 30,
				accessibleNodeIds: [BRANCH_ID],
			});
		});
	}
});
