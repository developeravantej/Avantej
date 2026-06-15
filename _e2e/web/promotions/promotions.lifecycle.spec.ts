import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Lifecycle for promotions: create → deactivate, API-verified.
// routerKey: promotions. No hard-delete API; teardown deactivates the promotion.
test.describe("promotions", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Promotion lifecycle — create, deactivate (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const code = testId("promo");

		// CREATE
		const created = await rpc(page.request, "promotions/create", {
			organizationId,
			code,
			name: `${code}-name`,
			type: "percentage",
			value: 10,
			validFrom: new Date().toISOString(),
		});
		const id = created?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`promotion ${id}`, async () => {
			await rpcRaw(page.request, "promotions/deactivate", {
				organizationId,
				id,
			});
		});

		// ASSERT PRESENT (active list contains it)
		const active = await rpc(page.request, "promotions/list", {
			organizationId,
			isActive: true,
		});
		expect(JSON.stringify(active)).toContain(code);

		// DEACTIVATE + ASSERT no longer active
		await rpc(page.request, "promotions/deactivate", { organizationId, id });
		const activeAfter = await rpc(page.request, "promotions/list", {
			organizationId,
			isActive: true,
		});
		const rows = Array.isArray(activeAfter)
			? activeAfter
			: (activeAfter?.items ?? activeAfter?.promotions ?? []);
		const stillActive = (rows as Array<{ id: string }>).some(
			(p) => p.id === id,
		);
		expect(stillActive).toBe(false);
	});
});
