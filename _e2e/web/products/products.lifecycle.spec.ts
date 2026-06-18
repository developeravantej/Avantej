import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getUomId,
} from "../_safe-mutation";

// Deep CRUD lifecycle, API-driven + API-verified, self-cleaning.
// products has no hard delete — "removal" is status: "discontinued".
// A product requires a real uomId, so a UOM is created as a dependency.
test.describe("products", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Product lifecycle — create, update, discontinue (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Dependency: reuse an existing UOM (uomId required on create). Reusing
		// avoids the unitsOfMeasure/create API-path 500 finding.
		const uomId = await getUomId(page.request);

		const sku = testId("sku");
		const name = testId("product");

		// CREATE
		const created = await rpc(page.request, "products/create", {
			organizationId,
			sku,
			name,
			uomId,
			price: 1000,
		});
		const id = created?.id ?? created?.product?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`product ${id}`, async () => {
			await rpcRaw(page.request, "products/update", {
				organizationId,
				id,
				status: "discontinued",
			});
		});

		// ASSERT PRESENT
		expect(
			(await rpc(page.request, "products/getById", { organizationId, id }))
				?.name,
		).toBe(name);

		// EDIT
		const name2 = `${name}-edited`;
		await rpc(page.request, "products/update", {
			organizationId,
			id,
			name: name2,
		});
		expect(
			(await rpc(page.request, "products/getById", { organizationId, id }))
				?.name,
		).toBe(name2);

		// DISCONTINUE + ASSERT not in active-status list
		await rpc(page.request, "products/update", {
			organizationId,
			id,
			status: "discontinued",
		});
		const activeList = await rpc(page.request, "products/list", {
			organizationId,
			status: "active",
		});
		expect(JSON.stringify(activeList)).not.toContain(name2);
	});
});
