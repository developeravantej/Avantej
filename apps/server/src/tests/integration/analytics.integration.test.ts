import { describe, test, expect, beforeAll } from "bun:test";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
} from "../helpers/integration-setup";
import { getDashboardKpis, getStaffPerformance } from "@avantej-core/services";

let tenantDb: ReturnType<typeof createTenantDb>;

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

describe("Analytics Integration", () => {
	test("getDashboardKpis returns correct shape (this_month)", async () => {
		if (shouldSkipIntegration()) return;

		const result = await getDashboardKpis(tenantDb, {
			period: "this_month",
			accessibleNodeIds: [], // admin - all access
		});

		// Assert shape (not specific values, as test data varies)
		expect(typeof result.period).toBe("string");
		expect(result.period).toBe("this_month");
		expect(typeof result.totalSales).toBe("number");
		expect(typeof result.salesOrderCount).toBe("number");
		expect(typeof result.totalAppointments).toBe("number");
		expect(typeof result.completedAppointments).toBe("number");
		expect(typeof result.activeMembersCount).toBe("number");
		expect(Array.isArray(result.revenueByBranch)).toBe(true);
		expect(result.from).toBeInstanceOf(Date);
		expect(result.to).toBeInstanceOf(Date);

		// Completion rate should never exceed total
		if (result.totalAppointments > 0) {
			expect(result.completedAppointments).toBeLessThanOrEqual(
				result.totalAppointments,
			);
		}

		// Non-negative values
		expect(result.totalSales).toBeGreaterThanOrEqual(0);
		expect(result.salesOrderCount).toBeGreaterThanOrEqual(0);
		expect(result.activeMembersCount).toBeGreaterThanOrEqual(0);
	}, 30000);

	test("getDashboardKpis returns correct shape for all period types", async () => {
		if (shouldSkipIntegration()) return;

		const periods = ["today", "this_week", "this_month", "this_year"] as const;

		for (const period of periods) {
			const result = await getDashboardKpis(tenantDb, {
				period,
				accessibleNodeIds: [],
			});

			expect(result.period).toBe(period);
			expect(typeof result.totalSales).toBe("number");
			expect(typeof result.salesOrderCount).toBe("number");
			expect(result.from).toBeInstanceOf(Date);
			expect(result.to).toBeInstanceOf(Date);
			expect(result.from.getTime()).toBeLessThanOrEqual(result.to.getTime());
		}
	}, 60000);

	test("'today' period counts <= 'this_year' period counts", async () => {
		if (shouldSkipIntegration()) return;

		const todayResult = await getDashboardKpis(tenantDb, {
			period: "today",
			accessibleNodeIds: [],
		});

		const yearResult = await getDashboardKpis(tenantDb, {
			period: "this_year",
			accessibleNodeIds: [],
		});

		// Year result should have >= today result for all cumulative metrics
		expect(yearResult.salesOrderCount).toBeGreaterThanOrEqual(
			todayResult.salesOrderCount,
		);
		expect(yearResult.totalAppointments).toBeGreaterThanOrEqual(
			todayResult.totalAppointments,
		);
		expect(yearResult.totalSales).toBeGreaterThanOrEqual(
			todayResult.totalSales,
		);
	}, 30000);

	test("getStaffPerformance returns correct shape", async () => {
		if (shouldSkipIntegration()) return;

		const result = await getStaffPerformance(tenantDb, {
			period: "this_month",
			accessibleNodeIds: [],
		});

		expect(Array.isArray(result)).toBe(true);

		// Each row should have the correct shape
		for (const row of result) {
			expect(typeof row.staffId).toBe("string");
			expect(typeof row.memberId).toBe("string");
			expect(typeof row.appointmentsCompleted).toBe("number");
			expect(typeof row.totalCommission).toBe("number");
			expect(row.appointmentsCompleted).toBeGreaterThanOrEqual(0);
			expect(row.totalCommission).toBeGreaterThanOrEqual(0);
		}
	}, 30000);

	test("getStaffPerformance for different periods", async () => {
		if (shouldSkipIntegration()) return;

		const periods = ["this_week", "this_month", "this_year"] as const;

		for (const period of periods) {
			const result = await getStaffPerformance(tenantDb, {
				period,
				accessibleNodeIds: [],
			});

			expect(Array.isArray(result)).toBe(true);
		}
	}, 60000);

	test("getDashboardKpis with branchId filter", async () => {
		if (shouldSkipIntegration()) return;

		// Unfiltered (all branches)
		const allResult = await getDashboardKpis(tenantDb, {
			period: "this_year",
			accessibleNodeIds: [],
		});

		// Filtered to specific branch
		const branchResult = await getDashboardKpis(tenantDb, {
			period: "this_year",
			accessibleNodeIds: [],
			branchId: "00000000-0000-4000-8000-000000000099", // non-existent branch
		});

		// Non-existent branch should have 0 or fewer results
		expect(branchResult.salesOrderCount).toBeLessThanOrEqual(
			allResult.salesOrderCount,
		);
	}, 30000);

	test("revenueByBranch has correct shape for each entry", async () => {
		if (shouldSkipIntegration()) return;

		const result = await getDashboardKpis(tenantDb, {
			period: "this_year",
			accessibleNodeIds: [],
		});

		for (const entry of result.revenueByBranch) {
			expect(typeof entry.branchId).toBe("string");
			expect(typeof entry.totalRevenue).toBe("number");
			expect(typeof entry.orderCount).toBe("number");
			// branchName can be string or null
			expect(
				entry.branchName === null || typeof entry.branchName === "string",
			).toBe(true);
		}
	}, 30000);
});
