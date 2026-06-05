import { test } from "@playwright/test";
import { expectRejected, getOrgId } from "../_safe-mutation";

// RULE: memberships.freeze must reject a window whose endDate is not strictly
// after startDate. The router enforces this with a BAD_REQUEST (400) guard that
// runs BEFORE any package-instance lookup, so a random packageInstanceId is fine
// — the request never reaches the service layer and creates nothing.
test.describe("memberships rule", () => {
	test("freeze rejects endDate <= startDate (400)", async ({ page }) => {
		const organizationId = getOrgId();
		const start = "2026-06-10T00:00:00.000Z";
		await expectRejected(
			page.request,
			"memberships/freeze",
			{
				organizationId,
				packageInstanceId: "00000000-0000-4000-8000-000000000001",
				startDate: start,
				endDate: start, // equal -> not strictly after -> 400
				reason: "medical",
			},
			[400],
		);
	});
});
