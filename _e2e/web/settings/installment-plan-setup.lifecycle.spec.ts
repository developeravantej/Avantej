import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Installment plan SETUP journey — admin configures a plan, then sells on installment:
//   create → plan is offered in the POS package-sale flow (installmentPlans/list
//   activeOnly:true is exactly what the POS + package-create forms consume) →
//   setDefault → deactivate → deactivated plan is no longer offered.
//
// Distinct from installment-plans.lifecycle.spec.ts (create/update/deactivate CRUD):
// this spec proves the settings → point-of-sale offering pipeline, including the
// default flag. routerKey: installmentPlans. No hard-delete exists; teardown
// deactivates the plan and restores the tenant's original default.
test.describe("settings/installment-plan-setup", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Installment plan setup — create, offered in POS options, setDefault, deactivate removes offer (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const code = testId("ips");
		const name = `${code}-name`;

		// Snapshot the tenant's current default plan BEFORE we touch the flag,
		// so we can restore it (singleton-ish state — withRestored spirit).
		const before = await rpc(page.request, "installmentPlans/list", {
			organizationId,
		});
		const originalDefault = (Array.isArray(before) ? before : []).find(
			(p: { isDefault?: boolean }) => p.isDefault,
		);

		// CREATE (3-month plan, 5% premium — mirrors real gym setup)
		const created = await rpc(page.request, "installmentPlans/create", {
			organizationId,
			code,
			name,
			numInstallments: 3,
			defaultIntervalDays: 30,
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
		if (originalDefault?.id) {
			cleanup.add(`restore default plan ${originalDefault.id}`, async () => {
				await rpcRaw(page.request, "installmentPlans/setDefault", {
					organizationId,
					id: originalDefault.id,
				});
			});
		}

		// OFFERED IN POS: the package-sale flow populates its plan select from
		// installmentPlans/list with activeOnly:true — the new plan must be there.
		const offered = await rpc(page.request, "installmentPlans/list", {
			organizationId,
			activeOnly: true,
		});
		const offeredPlan = (Array.isArray(offered) ? offered : []).find(
			(p: { id: string }) => p.id === id,
		);
		expect(
			offeredPlan,
			"newly created plan should be offered in the POS plan options",
		).toBeTruthy();
		expect(offeredPlan?.code).toBe(code);
		expect(offeredPlan?.numInstallments).toBe(3);
		expect(offeredPlan?.pricePremiumBps).toBe(500);

		// SET DEFAULT — the flag must land on our plan (and be visible to the
		// same list the sale forms read).
		await rpc(page.request, "installmentPlans/setDefault", {
			organizationId,
			id,
		});
		const afterDefault = await rpc(page.request, "installmentPlans/list", {
			organizationId,
			activeOnly: true,
		});
		const arr = Array.isArray(afterDefault) ? afterDefault : [];
		const ours = arr.find((p: { id: string }) => p.id === id);
		expect(ours?.isDefault, "setDefault should mark our plan default").toBe(
			true,
		);
		// Default must be unique — no other active plan still carries the flag.
		const otherDefaults = arr.filter(
			(p: { id: string; isDefault?: boolean }) => p.isDefault && p.id !== id,
		);
		expect(otherDefaults, "default flag must be exclusive").toHaveLength(0);

		// DEACTIVATE → plan disappears from the POS offering.
		await rpc(page.request, "installmentPlans/deactivate", {
			organizationId,
			id,
		});
		const afterDeactivate = await rpc(page.request, "installmentPlans/list", {
			organizationId,
			activeOnly: true,
		});
		const stillOffered = (
			Array.isArray(afterDeactivate) ? afterDeactivate : []
		).some((p: { id: string }) => p.id === id);
		expect(
			stillOffered,
			"deactivated plan must no longer be offered in POS options",
		).toBe(false);
	});
});
