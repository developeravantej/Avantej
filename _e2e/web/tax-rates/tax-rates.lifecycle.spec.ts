import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Deep CRUD lifecycle, API-driven + API-verified, self-cleaning.
// oRPC routerKey is "taxRates". No hard delete — removal is deactivate.
test.describe("tax-rates", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Tax rate lifecycle — create, update, deactivate (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const name = testId("taxrate");
		const code = testId("TAX").replace(/[^A-Za-z0-9]/g, "");

		// CREATE
		const created = await rpc(page.request, "taxRates/create", {
			organizationId,
			name,
			code,
			rateInBasisPoints: 600,
			effectiveFrom: new Date().toISOString(),
		});
		const id = created?.id ?? created?.taxRate?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`tax rate ${id}`, async () => {
			await rpcRaw(page.request, "taxRates/deactivate", { organizationId, id });
		});

		// ASSERT PRESENT
		const got = await rpc(page.request, "taxRates/getById", {
			organizationId,
			id,
		});
		expect(got?.name).toBe(name);
		expect(got?.rateInBasisPoints).toBe(600);

		// EDIT
		const name2 = `${name}-edited`;
		await rpc(page.request, "taxRates/update", {
			organizationId,
			id,
			name: name2,
			rateInBasisPoints: 800,
		});
		const got2 = await rpc(page.request, "taxRates/getById", {
			organizationId,
			id,
		});
		expect(got2?.name).toBe(name2);
		expect(got2?.rateInBasisPoints).toBe(800);

		// DEACTIVATE + ASSERT not in active list
		await rpc(page.request, "taxRates/deactivate", { organizationId, id });
		const activeList = await rpc(page.request, "taxRates/list", {
			organizationId,
			isActive: true,
		});
		expect(JSON.stringify(activeList)).not.toContain(name2);
	});
});
