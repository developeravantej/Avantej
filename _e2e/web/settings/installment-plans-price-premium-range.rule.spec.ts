import { test } from "@playwright/test";
import { testId, expectRejected, getOrgId } from "../_safe-mutation";

// Domain rule: pricePremiumBps must be within [0, 10000] → 400.
// routerKey: installmentPlans. Rejected at input validation, so nothing persists.
test.describe("settings/installment-plans", () => {
	test("rule: pricePremiumBps outside [0,10000] is rejected (400)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// below 0 → 400
		await expectRejected(
			page.request,
			"installmentPlans/create",
			{
				organizationId,
				code: testId("ip-neg"),
				name: "neg",
				numInstallments: 3,
				pricePremiumBps: -1,
			},
			[400],
		);

		// above 10000 → 400
		await expectRejected(
			page.request,
			"installmentPlans/create",
			{
				organizationId,
				code: testId("ip-big"),
				name: "big",
				numInstallments: 3,
				pricePremiumBps: 10001,
			},
			[400],
		);
	});
});
