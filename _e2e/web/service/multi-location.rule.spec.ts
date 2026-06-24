import { test, expect } from "@playwright/test";
import { Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

/**
 * UAT §11 — Multi-location availability.
 * "A service can be duplicated to another location and then modified" +
 * "A category or service can be switched on/off per location." Verified via
 * services.duplicate and per-branch pricing (setBranchPrice = enable a service
 * for a location). Self-cleaning: the duplicate is deactivated in finally.
 */
test.describe("§11 services — multi-location availability", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("duplicate service + enable per-location price", async ({ page }) => {
		const organizationId = getOrgId();
		const svcRes = await rpc(page.request, "services/list", { organizationId });
		const services = Array.isArray(svcRes)
			? svcRes
			: (svcRes?.items ?? svcRes?.services ?? []);
		const svc = services.find((s: any) => s.isActive) ?? services[0];
		test.skip(!svc, "no service fixture");

		const apptRes = await rpc(page.request, "appointments/list", {
			organizationId,
		});
		const appts = Array.isArray(apptRes)
			? apptRes
			: (apptRes?.items ?? apptRes?.appointments ?? []);
		const branchId = appts.find((a: any) => a.branchId)?.branchId;
		test.skip(!branchId, "no accessible branch");

		// DUPLICATE — a new service row, distinct id.
		const dup = await rpc(page.request, "services/duplicate", {
			organizationId,
			id: svc.id,
		});
		expect(dup?.id, `duplicate: ${JSON.stringify(dup)}`).toBeTruthy();
		expect(dup.id).not.toBe(svc.id);
		cleanup.add(`svc ${dup.id}`, async () => {
			await rpcRaw(page.request, "services/update", {
				organizationId,
				id: dup.id,
				isActive: false,
			});
		});

		// ENABLE per-location pricing for the duplicate.
		const price = await rpc(page.request, "services/setBranchPrice", {
			organizationId,
			serviceId: dup.id,
			branchId,
			priceCents: 12345,
		});
		expect(price, `setBranchPrice: ${JSON.stringify(price)}`).toBeTruthy();

		// DISABLE (best-effort) if the price row exposes an id.
		const priceId = price?.id ?? price?.priceId;
		if (priceId) {
			const del = await rpcRaw(page.request, "services/deleteBranchPrice", {
				organizationId,
				priceId,
			});
			expect(del.ok(), `deleteBranchPrice -> ${del.status()}`).toBeTruthy();
		}
	});
});
