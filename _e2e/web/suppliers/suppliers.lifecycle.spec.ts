import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Deep CRUD lifecycle, API-driven + API-verified, self-cleaning.
// suppliers has no hard delete — tear-down / "removal" is deactivate.
test.describe("suppliers", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Supplier lifecycle — create, update, deactivate (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const name = testId("supplier");

		// CREATE
		const created = await rpc(page.request, "suppliers/create", {
			organizationId,
			name,
		});
		const id = created?.id ?? created?.supplier?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`supplier ${id}`, async () => {
			await rpcRaw(page.request, "suppliers/deactivate", {
				organizationId,
				id,
			});
		});

		// ASSERT PRESENT via getById
		const got = await rpc(page.request, "suppliers/getById", {
			organizationId,
			id,
		});
		expect(got?.name).toBe(name);

		// EDIT
		const name2 = `${name}-edited`;
		await rpc(page.request, "suppliers/update", {
			organizationId,
			id,
			name: name2,
		});
		expect(
			(await rpc(page.request, "suppliers/getById", { organizationId, id }))
				?.name,
		).toBe(name2);

		// DEACTIVATE + ASSERT no longer in active list
		await rpc(page.request, "suppliers/deactivate", { organizationId, id });
		const activeList = await rpc(page.request, "suppliers/list", {
			organizationId,
			isActive: true,
		});
		expect(JSON.stringify(activeList)).not.toContain(name2);
	});
});
