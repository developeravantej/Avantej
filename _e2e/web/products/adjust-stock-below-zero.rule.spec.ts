import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getBranchId,
	getUomId,
	expectRejected,
} from "../_safe-mutation";

// Business rule: a negative stock adjustment that would drive quantity below
// zero is rejected with 400 "Insufficient stock" (DB CHECK + service guard).
test.describe("products — adjustStock below zero", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("adjustStock below zero is rejected (BAD_REQUEST)", async ({ page }) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		const uomId = await getUomId(page.request);

		const created = await rpc(page.request, "products/create", {
			organizationId,
			sku: testId("sku"),
			name: testId("product"),
			uomId,
			price: 500,
		});
		const productId = created?.id ?? created?.product?.id;
		expect(productId, `create: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`product ${productId}`, async () => {
			await rpcRaw(page.request, "products/update", {
				organizationId,
				id: productId,
				status: "discontinued",
			});
		});

		// Fresh product has zero stock at the branch; deducting must be rejected.
		await expectRejected(
			page.request,
			"products/adjustStock",
			{ organizationId, productId, branchId, delta: -5 },
			[400],
		);
	});
});
