import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	expectRejected,
} from "../_safe-mutation";

// Business rule (F-SVC-08): a service-category config whose bufferTimeMinutes
// exceeds the category defaultDuration is invalid → rejected with 400.
test.describe("service-category-config — buffer exceeds duration", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("bufferTimeMinutes greater than defaultDuration is rejected (BAD_REQUEST)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Dependency: a service category to attach config to.
		const category = await rpc(page.request, "serviceCategories/create", {
			organizationId,
			name: testId("svccat-cfg"),
		});
		const categoryId = category?.id;
		expect(
			categoryId,
			`category create: ${JSON.stringify(category)}`,
		).toBeTruthy();
		cleanup.add(`service category ${categoryId}`, async () => {
			await rpcRaw(page.request, "serviceCategories/update", {
				organizationId,
				id: categoryId,
				isActive: false,
			});
		});

		// buffer (60) > defaultDuration (30) → invalid.
		await expectRejected(
			page.request,
			"serviceCategoryConfig/upsert",
			{
				organizationId,
				categoryId,
				defaultDuration: 30,
				bufferTimeMinutes: 60,
			},
			[400],
		);
	});
});
