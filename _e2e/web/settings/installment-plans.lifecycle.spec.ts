import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Deep lifecycle for installment plans: create → update → deactivate, API-verified.
// routerKey: installmentPlans. No hard-delete exists, so teardown deactivates the plan.
test.describe("settings/installment-plans", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Installment plan lifecycle — create, update, deactivate (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const code = testId("ip");
		const name = `${code}-name`;

		// CREATE
		const created = await rpc(page.request, "installmentPlans/create", {
			organizationId,
			code,
			name,
			numInstallments: 3,
			pricePremiumBps: 500,
		});
		const id = created?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`installmentPlan ${id}`, async () => {
			await rpcRaw(page.request, "installmentPlans/deactivate", {
				organizationId,
				id,
			});
		});

		// ASSERT PRESENT
		const fetched = await rpc(page.request, "installmentPlans/getById", {
			organizationId,
			id,
		});
		expect(fetched?.code).toBe(code);
		expect(fetched?.numInstallments).toBe(3);

		// UPDATE
		const name2 = `${name}-edited`;
		await rpc(page.request, "installmentPlans/update", {
			organizationId,
			id,
			name: name2,
			numInstallments: 6,
		});
		const fetched2 = await rpc(page.request, "installmentPlans/getById", {
			organizationId,
			id,
		});
		expect(fetched2?.name).toBe(name2);
		expect(fetched2?.numInstallments).toBe(6);

		// DEACTIVATE + ASSERT no longer in active-only list
		await rpc(page.request, "installmentPlans/deactivate", {
			organizationId,
			id,
		});
		const activeOnly = await rpc(page.request, "installmentPlans/list", {
			organizationId,
			activeOnly: true,
		});
		const stillActive = (Array.isArray(activeOnly) ? activeOnly : []).some(
			(p: { id: string }) => p.id === id,
		);
		expect(stillActive).toBe(false);
	});
});
