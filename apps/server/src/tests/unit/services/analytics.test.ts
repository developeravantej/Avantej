import { describe, test, expect, beforeEach } from "bun:test";
import {
	createMockTenantDb,
	selectChainResolving,
} from "../../helpers/db-mock.factory";

import {
	getDashboardKpis,
	getStaffPerformance,
} from "@avantej-core/services/analytics.service";

let mockDb: any;

function setupEmptyKpiMocks(db: ReturnType<typeof createMockTenantDb>) {
	// getDashboardKpis makes 6 select() calls (in order):
	// 1. salesResult, 2. prevSalesResult, 3. apptTotal, 4. apptCompleted,
	// 5. fillDrizzle (class fill rate), 6. revByBranch
	// (AVANTEJ-7: the active-members count now runs via tenantDb.execute() against
	// customer_profiles instead of a members-table select().)
	db.select
		.mockReturnValueOnce(selectChainResolving([{ total: null, orderCount: 0 }]))
		.mockReturnValueOnce(selectChainResolving([{ total: null, orderCount: 0 }]))
		.mockReturnValueOnce(selectChainResolving([{ apptCount: 0 }]))
		.mockReturnValueOnce(selectChainResolving([{ completedCount: 0 }]))
		.mockReturnValueOnce(
			selectChainResolving([{ spotsBooked: null, capacity: null }]),
		)
		.mockReturnValueOnce(selectChainResolving([]));
	// getDashboardKpis makes 3 tenantDb.execute() calls (in order):
	// 1. activeMembers, 2. churn, 3. ltv. All read `.rows`; default → [].
	db.execute.mockResolvedValue({ rows: [] });
}

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── getDashboardKpis — period mapping ──────────────────────────────────────
describe("getDashboardKpis — period mapping", () => {
	test("'today' period maps to start and end of current day", async () => {
		setupEmptyKpiMocks(mockDb);

		const result = await getDashboardKpis(mockDb, {
			period: "today",
			accessibleNodeIds: [],
		});

		expect(result.period).toBe("today");
		expect(result.from).toBeInstanceOf(Date);
		expect(result.to).toBeInstanceOf(Date);
		expect(result.from.toDateString()).toBe(result.to.toDateString());
	});

	test("'this_week' period returns a week range", async () => {
		setupEmptyKpiMocks(mockDb);

		const result = await getDashboardKpis(mockDb, {
			period: "this_week",
			accessibleNodeIds: [],
		});

		expect(result.period).toBe("this_week");
		const diffMs = result.to.getTime() - result.from.getTime();
		const diffDays = diffMs / (1000 * 60 * 60 * 24);
		expect(diffDays).toBeGreaterThanOrEqual(6);
		expect(diffDays).toBeLessThan(8);
	});

	test("'this_month' period starts on the 1st", async () => {
		setupEmptyKpiMocks(mockDb);

		const result = await getDashboardKpis(mockDb, {
			period: "this_month",
			accessibleNodeIds: [],
		});

		expect(result.period).toBe("this_month");
		expect(result.from.getDate()).toBe(1);
	});

	test("'this_year' period spans Jan 1 to Dec 31", async () => {
		setupEmptyKpiMocks(mockDb);

		const result = await getDashboardKpis(mockDb, {
			period: "this_year",
			accessibleNodeIds: [],
		});

		expect(result.period).toBe("this_year");
		expect(result.from.getMonth()).toBe(0);
		expect(result.from.getDate()).toBe(1);
		expect(result.to.getMonth()).toBe(11);
		expect(result.to.getDate()).toBe(31);
	});

	test("'custom' uses provided from and to dates", async () => {
		setupEmptyKpiMocks(mockDb);

		const fromDate = new Date("2026-01-01T00:00:00.000Z");
		const toDate = new Date("2026-01-31T23:59:59.999Z");

		const result = await getDashboardKpis(mockDb, {
			period: "custom",
			from: fromDate,
			to: toDate,
			accessibleNodeIds: [],
		});

		expect(result.period).toBe("custom");
		expect(result.from).toEqual(fromDate);
		expect(result.to).toEqual(toDate);
	});
});

// ─── getDashboardKpis — return values ───────────────────────────────────────
describe("getDashboardKpis — return values", () => {
	test("returns zeros when no data exists", async () => {
		setupEmptyKpiMocks(mockDb);

		const result = await getDashboardKpis(mockDb, {
			period: "this_month",
			accessibleNodeIds: [],
		});

		expect(result.totalSales).toBe(0);
		expect(result.salesOrderCount).toBe(0);
		expect(result.totalAppointments).toBe(0);
		expect(result.completedAppointments).toBe(0);
		expect(result.activeMembersCount).toBe(0);
		expect(result.revenueByBranch).toEqual([]);
	});

	test("returns correct values with actual data", async () => {
		mockDb.select
			.mockReturnValueOnce(
				selectChainResolving([{ total: "50000", orderCount: 5 }]),
			)
			// prevSalesResult (previous equal-length window)
			.mockReturnValueOnce(
				selectChainResolving([{ total: "40000", orderCount: 4 }]),
			)
			.mockReturnValueOnce(selectChainResolving([{ apptCount: 10 }]))
			.mockReturnValueOnce(selectChainResolving([{ completedCount: 7 }]))
			// fillDrizzle (class fill rate)
			.mockReturnValueOnce(
				selectChainResolving([{ spotsBooked: null, capacity: null }]),
			)
			.mockReturnValueOnce(
				selectChainResolving([
					{
						branchId: "branch-1",
						branchName: "KL Branch",
						totalRevenue: "30000",
						orderCount: 3,
					},
				]),
			);
		// AVANTEJ-7: active-members count is the first execute() call now.
		mockDb.execute
			.mockResolvedValueOnce({ rows: [{ active_count: 15 }] }) // activeMembers
			.mockResolvedValue({ rows: [] }); // churn, ltv

		const result = await getDashboardKpis(mockDb, {
			period: "this_month",
			accessibleNodeIds: [],
		});

		expect(result.totalSales).toBe(50000);
		expect(result.salesOrderCount).toBe(5);
		expect(result.totalAppointments).toBe(10);
		expect(result.completedAppointments).toBe(7);
		expect(result.activeMembersCount).toBe(15);
		expect(result.revenueByBranch).toHaveLength(1);
		expect(result.revenueByBranch[0]!.branchId).toBe("branch-1");
		expect(result.revenueByBranch[0]!.totalRevenue).toBe(30000);
	});
});

// ─── getDashboardKpis — RBAC filtering ──────────────────────────────────────
describe("getDashboardKpis — RBAC filtering", () => {
	test("admin (empty accessibleNodeIds) sees all branches", async () => {
		setupEmptyKpiMocks(mockDb);

		const result = await getDashboardKpis(mockDb, {
			period: "this_month",
			accessibleNodeIds: [],
		});

		expect(result).toBeDefined();
		expect(mockDb.select).toHaveBeenCalled();
	});

	test("staff (non-empty accessibleNodeIds) is filtered to their nodes", async () => {
		setupEmptyKpiMocks(mockDb);

		const result = await getDashboardKpis(mockDb, {
			period: "this_month",
			accessibleNodeIds: ["node-1", "node-2"],
		});

		expect(result).toBeDefined();
		expect(mockDb.select).toHaveBeenCalled();
	});
});

// ─── getStaffPerformance ─────────────────────────────────────────────────────
describe("getStaffPerformance", () => {
	test("returns empty array when no commission data", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await getStaffPerformance(mockDb, {
			period: "this_month",
			accessibleNodeIds: [],
		});

		expect(result).toEqual([]);
	});

	test("returns staff with performance data", async () => {
		// First select: commission aggregation
		mockDb.select.mockReturnValueOnce(
			selectChainResolving([
				{ staffId: "user-1", appointmentCount: 5, totalCommission: "25000" },
				{ staffId: "user-2", appointmentCount: 3, totalCommission: "15000" },
			]),
		);
		// Second select: member ID lookup
		mockDb.select.mockReturnValueOnce(
			selectChainResolving([
				{ userId: "user-1", id: "member-1" },
				{ userId: "user-2", id: "member-2" },
			]),
		);

		const result = await getStaffPerformance(mockDb, {
			period: "this_month",
			accessibleNodeIds: [],
		});

		expect(result).toHaveLength(2);
		expect(result[0]!.staffId).toBe("user-1");
		expect(result[0]!.memberId).toBe("member-1");
		expect(result[0]!.appointmentsCompleted).toBe(5);
		expect(result[0]!.totalCommission).toBe(25000);
	});
});
