import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Deep CRUD lifecycle, API-driven + API-verified, self-cleaning.
// oRPC routerKey is "productCategories" (see baseRouter).
test.describe("product-categories", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Product category lifecycle — create, update, delete (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const name = testId("prodcat");

		// CREATE
		const created = await rpc(page.request, "productCategories/create", {
			organizationId,
			name,
		});
		const id = created?.id ?? created?.category?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`product category ${id}`, async () => {
			await rpcRaw(page.request, "productCategories/delete", {
				organizationId,
				id,
			});
		});

		// ASSERT PRESENT
		expect(
			(
				await rpc(page.request, "productCategories/getById", {
					organizationId,
					id,
				})
			)?.name,
		).toBe(name);

		// EDIT
		const name2 = `${name}-edited`;
		await rpc(page.request, "productCategories/update", {
			organizationId,
			id,
			name: name2,
		});
		expect(
			(
				await rpc(page.request, "productCategories/getById", {
					organizationId,
					id,
				})
			)?.name,
		).toBe(name2);

		// DELETE + ASSERT GONE
		await rpc(page.request, "productCategories/delete", { organizationId, id });
		const list = await rpc(page.request, "productCategories/list", {
			organizationId,
		});
		expect(JSON.stringify(list)).not.toContain(name2);
	});
});
