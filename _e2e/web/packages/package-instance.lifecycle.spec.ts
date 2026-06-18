import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";
import { getPkgFixtures, pkgWindow } from "../_pkg-fixtures";

// Package-instance lifecycle — API-driven + API-verified, self-cleaning.
// Covers create (assigned source) + freeze → unfreeze → extend → cancel.
// Cleanup cancels the instance (no hard delete for package instances).
test.describe("packages — package-instance lifecycle", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("create → freeze → unfreeze → extend → cancel (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(
			!fx.serviceId || !fx.clientId,
			"no service/client fixture available",
		);
		const { startsAt, expiresAt } = pkgWindow();

		// CREATE — assigned source, paid, so it lands `active` (no approval gate).
		const created = await rpc(page.request, "packageInstances/create", {
			organizationId,
			serviceId: fx.serviceId,
			clientId: fx.clientId,
			source: "assigned",
			creditsTotal: 10,
			creditsUsed: 0,
			startsAt,
			expiresAt,
			totalPrice: 0,
			paymentStatus: "paid",
			purchaseNumber: testId("pn"),
		});
		const id = created?.id;
		expect(id, `create: ${JSON.stringify(created)}`).toBeTruthy();
		expect(created?.status).toBe("active");
		cleanup.add(`pkg ${id}`, async () => {
			await rpcRaw(page.request, "packageInstances/cancel", {
				organizationId,
				id,
				reason: "E2E-DEEP cleanup",
			});
		});

		// FREEZE → status frozen.
		const frozen = await rpc(page.request, "packageInstances/freeze", {
			organizationId,
			id,
			reason: "E2E-DEEP freeze",
		});
		expect(frozen?.status).toBe("frozen");

		// UNFREEZE → back to active.
		const unfrozen = await rpc(page.request, "packageInstances/unfreeze", {
			organizationId,
			id,
		});
		expect(unfrozen?.status).toBe("active");

		// EXTEND → expiresAt moves forward.
		const extended = await rpc(page.request, "packageInstances/extend", {
			organizationId,
			id,
			addDays: 30,
			reason: "E2E-DEEP extend",
		});
		expect(
			new Date(extended?.expiresAt).getTime(),
			`extend should push expiresAt past ${expiresAt}`,
		).toBeGreaterThan(new Date(expiresAt).getTime());

		// CANCEL → status cancelled.
		const cancelled = await rpc(page.request, "packageInstances/cancel", {
			organizationId,
			id,
			reason: "E2E-DEEP cancel",
		});
		expect(cancelled?.status).toBe("cancelled");
	});
});
