import { test, expect } from "@playwright/test";
import { rpc, getOrgId } from "../_safe-mutation";

/**
 * UAT §13 — Reporting filters. Dashboard KPIs accept the period filters the
 * reports UI exposes (this_week / this_month / this_year) and return data each
 * time. (Permission controls covered by reporting-scope.rbac; export has no API
 * surface yet — deferred.)
 */
test.describe("§13 reporting — filters", () => {
	test("dashboard KPIs accept period filters", async ({ page }) => {
		const organizationId = getOrgId();
		for (const period of ["this_week", "this_month", "this_year"]) {
			const r = await rpc(page.request, "analytics/getDashboardKpis", {
				organizationId,
				period,
			});
			expect(r, `KPIs for period=${period} should return`).toBeTruthy();
		}
	});
});
