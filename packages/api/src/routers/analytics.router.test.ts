/**
 * Analytics router — branch scope and org context guards.
 */

import { describe, expect, it, mock, beforeEach } from "bun:test";
import { call } from "@orpc/server";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OUT_OF_SCOPE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const mockGetDashboardKpis = mock(() =>
	Promise.resolve({
		period: "today",
		from: new Date(),
		to: new Date(),
		totalSales: 0,
		salesOrderCount: 0,
		previousPeriodSales: 0,
		previousPeriodOrderCount: 0,
		totalAppointments: 0,
		completedAppointments: 0,
		activeMembersCount: 0,
		revenueByBranch: [],
		churnRatePct: 0,
		avgLtvCents: 0,
		classFillRatePct: 0,
	}),
);

mock.module("@avantej-core/services/analytics.service", () => ({
	getDashboardKpis: mockGetDashboardKpis,
	getStaffPerformance: mock(() => Promise.resolve([])),
	getRevenueSeries: mock(() => Promise.resolve([])),
	getMemberCountSeries: mock(() => Promise.resolve([])),
	getChurnSeries: mock(() => Promise.resolve([])),
	getLtvSeries: mock(() => Promise.resolve([])),
	getClassFillRateSeries: mock(() => Promise.resolve([])),
}));

import { analyticsRouter } from "./analytics";

function makeAdminDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
	} as unknown as never;
}

describe("analyticsRouter.getDashboardKpis", () => {
	beforeEach(() => {
		mockGetDashboardKpis.mockClear();
	});

	it("rejects organizationId mismatch", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [BRANCH_ID],
		});

		await expect(
			call(
				analyticsRouter.getDashboardKpis,
				{ organizationId: OTHER_ORG, period: "today" },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects branchId outside accessibleNodeIds", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [BRANCH_ID],
		});

		await expect(
			call(
				analyticsRouter.getDashboardKpis,
				{ organizationId: ORG_ID, period: "today", branchId: OUT_OF_SCOPE },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("delegates when branchId is in scope", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [BRANCH_ID],
		});

		await call(
			analyticsRouter.getDashboardKpis,
			{ organizationId: ORG_ID, period: "today", branchId: BRANCH_ID },
			{ context: ctx },
		);
		expect(mockGetDashboardKpis).toHaveBeenCalledTimes(1);
	});
});
