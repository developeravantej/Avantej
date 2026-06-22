import { test, expect } from "@playwright/test";
import { rpc, getOrgId } from "../_safe-mutation";

/**
 * UAT §6 — Google Calendar (Avantej-side).
 * The OAuth connect + 2-way sync round-trip needs Google credentials (deferred).
 * What we CAN verify in-app: the connection-management endpoints respond cleanly
 * (status / orgStatus), proving the Avantej side of the integration is wired.
 */
test.describe("§6 Google Calendar — Avantej-side endpoints", () => {
	test("status + orgStatus respond (connection management wired)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const status = await rpc(page.request, "googleCalendar/status", {
			organizationId,
		});
		expect(status, "googleCalendar/status should return").toBeTruthy();

		const orgStatus = await rpc(page.request, "googleCalendar/orgStatus", {
			organizationId,
		});
		expect(orgStatus, "googleCalendar/orgStatus should return").toBeTruthy();
	});
});
