import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Deep CRUD lifecycle, API-driven + API-verified, self-cleaning.
// oRPC HTTP path is router/procedure (e.g. brands/create).
test.describe("brands", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Brand lifecycle — create, list, update, delete (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const name = testId("brand");

		// CREATE
		const created = await rpc(page.request, "brands/create", {
			organizationId,
			name,
		});
		const id = created?.id ?? created?.brand?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`brand ${id}`, async () => {
			await rpcRaw(page.request, "brands/delete", { organizationId, id });
		});

		// ASSERT PRESENT (re-query through the API)
		const list1 = await rpc(page.request, "brands/list", { organizationId });
		expect(JSON.stringify(list1)).toContain(name);

		// EDIT
		const name2 = `${name}-edited`;
		await rpc(page.request, "brands/update", {
			organizationId,
			id,
			name: name2,
		});
		const got = await rpc(page.request, "brands/getById", {
			organizationId,
			id,
		});
		expect(got?.name).toBe(name2);

		// DELETE + ASSERT GONE
		await rpc(page.request, "brands/delete", { organizationId, id });
		const list3 = await rpc(page.request, "brands/list", { organizationId });
		expect(JSON.stringify(list3)).not.toContain(name2);
	});
});
