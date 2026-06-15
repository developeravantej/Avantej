import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Deep CRUD lifecycle for custom roles, API-driven + API-verified, self-cleaning.
// oRPC HTTP path is router/procedure (e.g. roles/create). routerKey: roles.
test.describe("access-control/roles", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Role lifecycle — create, list, update, delete (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const name = testId("role");

		// CREATE
		const created = await rpc(page.request, "roles/create", {
			organizationId,
			name,
			description: "e2e custom role",
			priority: 50,
		});
		const id = created?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`role ${id}`, async () => {
			await rpcRaw(page.request, "roles/delete", { organizationId, id });
		});

		// ASSERT PRESENT
		const list1 = await rpc(page.request, "roles/list", { organizationId });
		expect(JSON.stringify(list1)).toContain(name);

		// UPDATE
		const name2 = `${name}-edited`;
		await rpc(page.request, "roles/update", {
			organizationId,
			id,
			name: name2,
			priority: 60,
		});
		const list2 = await rpc(page.request, "roles/list", { organizationId });
		const updated = (Array.isArray(list2) ? list2 : []).find(
			(r: { id: string }) => r.id === id,
		);
		expect(updated?.name).toBe(name2);
		expect(updated?.priority).toBe(60);

		// DELETE + ASSERT GONE
		await rpc(page.request, "roles/delete", { organizationId, id });
		const list3 = await rpc(page.request, "roles/list", { organizationId });
		expect(JSON.stringify(list3)).not.toContain(name2);
	});
});
