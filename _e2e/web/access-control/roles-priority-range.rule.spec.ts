import { test } from "@playwright/test";
import { testId, expectRejected, getOrgId } from "../_safe-mutation";

// Domain rule: custom role priority must be 1-99 (100 reserved for admin) → 400.
// routerKey: roles. The create is rejected at input validation, so nothing persists.
test.describe("access-control/roles", () => {
	test("rule: role priority outside 1-99 is rejected (400)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// priority 0 (below min) → 400
		await expectRejected(
			page.request,
			"roles/create",
			{ organizationId, name: testId("role-lo"), priority: 0 },
			[400],
		);

		// priority 100 (above max — reserved for admin) → 400
		await expectRejected(
			page.request,
			"roles/create",
			{ organizationId, name: testId("role-hi"), priority: 100 },
			[400],
		);
	});
});
