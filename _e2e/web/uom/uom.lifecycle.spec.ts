import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Deep CRUD lifecycle, API-driven + API-verified, self-cleaning.
// oRPC routerKey is "unitsOfMeasure" (see baseRouter).
test.describe("uom", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Unit of measure lifecycle — create, update, delete (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const name = testId("uom");

		// CREATE
		const created = await rpc(page.request, "unitsOfMeasure/create", {
			organizationId,
			name,
		});
		const id = created?.id ?? created?.uom?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`uom ${id}`, async () => {
			await rpcRaw(page.request, "unitsOfMeasure/delete", {
				organizationId,
				id,
			});
		});

		// ASSERT PRESENT
		expect(
			(
				await rpc(page.request, "unitsOfMeasure/getById", {
					organizationId,
					id,
				})
			)?.name,
		).toBe(name);

		// EDIT
		const name2 = `${name}-edited`;
		await rpc(page.request, "unitsOfMeasure/update", {
			organizationId,
			id,
			name: name2,
		});
		expect(
			(
				await rpc(page.request, "unitsOfMeasure/getById", {
					organizationId,
					id,
				})
			)?.name,
		).toBe(name2);

		// DELETE + ASSERT GONE
		await rpc(page.request, "unitsOfMeasure/delete", { organizationId, id });
		const list = await rpc(page.request, "unitsOfMeasure/list", {
			organizationId,
		});
		expect(JSON.stringify(list)).not.toContain(name2);
	});
});
