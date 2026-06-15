import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Business rule: at most one active default tax rate. Creating a second rate
// with isDefault:true clears the prior default (transactional in
// createTaxRate). Restores the pre-existing real default afterwards.
test.describe("tax-rates — default uniqueness", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("creating a second default clears the prior default", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Capture any pre-existing real default so we can restore it.
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

		const mkCode = () => testId("TAX").replace(/[^A-Za-z0-9]/g, "");

		// First default (A)
		const a = await rpc(page.request, "taxRates/create", {
			organizationId,
			name: testId("taxrate-A"),
			code: mkCode(),
			rateInBasisPoints: 600,
			isDefault: true,
			effectiveFrom: new Date().toISOString(),
		});
		const aId = a?.id;
		expect(aId, `create A: ${JSON.stringify(a)}`).toBeTruthy();
		cleanup.add(`tax rate A ${aId}`, async () => {
			await rpcRaw(page.request, "taxRates/deactivate", {
				organizationId,
				id: aId,
			});
		});
		expect(a?.isDefault).toBe(true);
		expect(
			(await rpc(page.request, "taxRates/getDefault", { organizationId }))?.id,
		).toBe(aId);

		// Second default (B) — must steal the default flag from A
		const b = await rpc(page.request, "taxRates/create", {
			organizationId,
			name: testId("taxrate-B"),
			code: mkCode(),
			rateInBasisPoints: 800,
			isDefault: true,
			effectiveFrom: new Date().toISOString(),
		});
		const bId = b?.id;
		expect(bId, `create B: ${JSON.stringify(b)}`).toBeTruthy();
		cleanup.add(`tax rate B ${bId}`, async () => {
			await rpcRaw(page.request, "taxRates/deactivate", {
				organizationId,
				id: bId,
			});
		});

		// Only B is default now
		expect(b?.isDefault).toBe(true);
		expect(
			(await rpc(page.request, "taxRates/getDefault", { organizationId }))?.id,
		).toBe(bId);
		// A is no longer default
		expect(
			(await rpc(page.request, "taxRates/getById", { organizationId, id: aId }))
				?.isDefault,
		).toBe(false);
	});
});
