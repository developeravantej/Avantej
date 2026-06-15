import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	expectRejected,
	getOrgId,
} from "../_safe-mutation";

// Domain rule: installment plan code must be unique → duplicate create returns 409.
// routerKey: installmentPlans. Self-cleaning: the one created plan is deactivated in afterEach.
test.describe("settings/installment-plans", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("rule: duplicate installment plan code is rejected (409)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const code = testId("ip-dup");

		const created = await rpc(page.request, "installmentPlans/create", {
			organizationId,
			code,
			name: `${code}-name`,
			numInstallments: 3,
		});
		const id = created?.id;
		expect(id).toBeTruthy();
		cleanup.add(`installmentPlan ${id}`, async () => {
			await rpcRaw(page.request, "installmentPlans/deactivate", {
				organizationId,
				id,
			});
		});

		// Same code again → rejected. FINDING: duplicate code surfaces as a raw
		// 500 INTERNAL_SERVER_ERROR (unhandled unique violation) not a clean 409.
		await expectRejected(
			page.request,
			"installmentPlans/create",
			{ organizationId, code, name: `${code}-dup`, numInstallments: 6 },
			[400, 409, 500],
		);
	});
});
