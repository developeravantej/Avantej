import { test } from "@playwright/test";
import { expectForbidden } from "../_safe-mutation";

// Multi-tenant boundary that is testable WITHOUT a second tenant: a request whose
// organizationId resolves to no organization is rejected (403) by the tenant
// middleware BEFORE the handler runs. (The cross-tenant *mismatch* and no-member
// cases need a real second tenant/user and remain deferred — see update-ledger.mjs.)
test.describe("multi-tenant — unknown organization", () => {
	test("a request for a non-existent organizationId is rejected (403)", async ({
		page,
	}) => {
		// A well-formed UUID that maps to no organization row.
		const bogusOrg = "00000000-0000-0000-0000-0000000000aa";
		await expectForbidden(page.request, "hierarchy/listNodes", {
			organizationId: bogusOrg,
		});
	});
});
