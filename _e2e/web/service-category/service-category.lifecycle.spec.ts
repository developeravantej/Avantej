import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getBranchId,
} from "../_safe-mutation";

// Deep lifecycle, API-driven + API-verified, self-cleaning.
// serviceCategories has create/update only (no hard delete) —
// "removal" is isActive:false.
test.describe("service-category", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Service category lifecycle — create, update, deactivate (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);
		const name = testId("svccat");

		// CREATE
		const created = await rpc(page.request, "serviceCategories/create", {
			organizationId,
			branchId,
			name,
		});
		const id = created?.id ?? created?.category?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`service category ${id}`, async () => {
			await rpcRaw(page.request, "serviceCategories/update", {
				organizationId,
				branchId,
				id,
				isActive: false,
			});
		});

		// ASSERT PRESENT
		expect(
			(
				await rpc(page.request, "serviceCategories/getById", {
					organizationId,
					branchId,
					id,
				})
			)?.name,
		).toBe(name);

		// EDIT
		const name2 = `${name}-edited`;
		await rpc(page.request, "serviceCategories/update", {
			organizationId,
			branchId,
			id,
			name: name2,
		});
		expect(
			(
				await rpc(page.request, "serviceCategories/getById", {
					organizationId,
					branchId,
					id,
				})
			)?.name,
		).toBe(name2);

		// DEACTIVATE + ASSERT not in active list
		await rpc(page.request, "serviceCategories/update", {
			organizationId,
			branchId,
			id,
			isActive: false,
		});
		const activeList = await rpc(page.request, "serviceCategories/list", {
			organizationId,
			isActive: true,
		});
		expect(JSON.stringify(activeList)).not.toContain(name2);
	});
});
