import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getUomId,
	expectRejected,
} from "../_safe-mutation";

// Business rule: SKU is unique (products_sku_unique constraint). Creating a
// second product with the same SKU is rejected. The router does not catch the
// PG unique violation, so it surfaces as INTERNAL_SERVER_ERROR (500); some
// builds may map it to 400/409 — accept any of them as a rejection.
test.describe("products — duplicate sku", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("creating a second product with the same sku is rejected", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const uomId = await getUomId(page.request);

		const sku = testId("sku");

		const created = await rpc(page.request, "products/create", {
			organizationId,
			sku,
			name: testId("product"),
			uomId,
			price: 500,
		});
		const id = created?.id ?? created?.product?.id;
		expect(id, `create: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`product ${id}`, async () => {
			await rpcRaw(page.request, "products/update", {
				organizationId,
				id,
				status: "discontinued",
			});
		});

		// Second create with the SAME sku must fail.
		await expectRejected(
			page.request,
			"products/create",
			{ organizationId, sku, name: testId("product"), uomId, price: 600 },
			[400, 409, 500],
		);
	});
});
