import { test } from "@playwright/test";
import { expectRejected, getOrgId } from "../_safe-mutation";

// RULE: customerProfiles.upsertForCustomer must reject a targetUserId that is
// not a `client` member in this tenant. The handler looks up the target member
// and throws NOT_FOUND (404) when absent — or FORBIDDEN (403) if the caller
// lacks customer_management:update. Either rejection proves the guard holds.
test.describe("customer-profiles rule", () => {
	test("upsertForCustomer rejects an unknown target customer", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		await expectRejected(
			page.request,
			"customerProfiles/upsertForCustomer",
			{
				organizationId,
				targetUserId: `e2e-nonexistent-user-${Date.now()}`,
				phone: "+60100000000",
			},
			[403, 404],
		);
	});
});
