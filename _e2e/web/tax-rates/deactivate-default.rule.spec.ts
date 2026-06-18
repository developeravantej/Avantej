import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Business rule: deactivating the default tax rate does NOT throw — it silently
// clears the isDefault flag while marking it inactive. Restores the pre-existing
// real default afterwards.
test.describe("tax-rates — deactivate default", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("deactivating the default does not throw and clears isDefault", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const priorDefault = await rpc(page.request, "taxRates/getDefault", {
			organizationId,
		});
		const priorDefaultId = priorDefault?.id ?? null;
		if (priorDefaultId) {
			cleanup.add(`restore default ${priorDefaultId}`, async () => {
				await rpcRaw(page.request, "taxRates/setDefault", {
					organizationId,
					id: priorDefaultId,
				});
			});
		}

		const created = await rpc(page.request, "taxRates/create", {
			organizationId,
			name: testId("taxrate-def"),
			code: testId("TAX").replace(/[^A-Za-z0-9]/g, ""),
			rateInBasisPoints: 600,
			isDefault: true,
			effectiveFrom: new Date().toISOString(),
		});
		const id = created?.id;
		expect(id, `create: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`tax rate ${id}`, async () => {
			await rpcRaw(page.request, "taxRates/deactivate", { organizationId, id });
		});
		expect(created?.isDefault).toBe(true);

		// Deactivate the default — must succeed (no throw) and return the row.
		const deactivated = await rpc(page.request, "taxRates/deactivate", {
			organizationId,
			id,
		});
		expect(deactivated?.id).toBe(id);
		expect(deactivated?.isActive).toBe(false);
		expect(deactivated?.isDefault).toBe(false);

		// getById confirms the cleared flags persisted.
		const got = await rpc(page.request, "taxRates/getById", {
			organizationId,
			id,
		});
		expect(got?.isDefault).toBe(false);
		expect(got?.isActive).toBe(false);
	});
});
