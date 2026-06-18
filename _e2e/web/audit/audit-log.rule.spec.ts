import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync } from "node:fs";
import { rpc, getOrgId, expectForbidden } from "../_safe-mutation";

// Audit-log read access + scope boundary.
// - admin can list audit rows (the audit_log:read operation).
// - a non-admin (staff) is FORBIDDEN — the access boundary that backs the
//   node-scope isolation guarantee (non-admins never see out-of-scope audit
//   rows; here staff lacks audit_log:read entirely, so it sees none).
const STAFF_STATE = "_e2e/.auth/staff.json";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

test.describe("audit — log access + scope boundary", () => {
	test("admin can list audit logs", async ({ page }) => {
		const organizationId = getOrgId();
		const res = await rpc(page.request, "auditLogs/list", {
			organizationId,
			limit: 10,
		});
		const rows = Array.isArray(res) ? res : (res?.rows ?? res?.items ?? []);
		expect(Array.isArray(rows)).toBe(true);
		// The tenant has activity (this very suite writes audit rows), so the admin
		// feed should be non-empty.
		expect(rows.length).toBeGreaterThan(0);
	});

	test("a non-admin (staff) is forbidden from reading audit logs", async ({
		playwright,
	}) => {
		test.skip(
			!existsSync(STAFF_STATE),
			"no staff session — run `bun e2e:seed`",
		);
		const organizationId = getOrgId();
		const staff: APIRequestContext = await playwright.request.newContext({
			baseURL: BASE,
			storageState: STAFF_STATE,
		});
		await expectForbidden(staff, "auditLogs/list", {
			organizationId,
			limit: 10,
		});
		await staff.dispose();
	});
});
