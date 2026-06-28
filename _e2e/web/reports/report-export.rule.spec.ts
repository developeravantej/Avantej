import { test, expect } from "@playwright/test";
import { rpc, getOrgId } from "../_safe-mutation";

/**
 * UAT §13 — Reporting export. The audit-log report exposes a CSV export
 * (auditLogs/exportCsv); this verifies the export endpoint returns data,
 * covering the §13 "export" check item.
 */
test.describe("§13 reporting — export", () => {
	test("audit-log CSV export returns data", async ({ page }) => {
		const organizationId = getOrgId();
		const res = await rpc(page.request, "auditLogs/exportCsv", {
			organizationId,
			maxRows: 50,
		});
		expect(res, "exportCsv should return a result").toBeTruthy();
	});
});
