import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";
import { getPkgFixtures, pkgWindow } from "../_pkg-fixtures";

// Purchased-package approval flow — covers the approval-gate invariant plus
// assignTrainer / reject / confirmPayment transitions. API-driven + verified.
test.describe("packages — purchased approval flow", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	async function createPurchased(
		request: any,
		organizationId: string,
		fx: any,
	) {
		const { startsAt, expiresAt } = pkgWindow();
		const created = await rpc(request, "packageInstances/create", {
			organizationId,
			serviceId: fx.serviceId,
			clientId: fx.clientId,
			source: "purchased",
			creditsTotal: 5,
			startsAt,
			expiresAt,
			totalPrice: 0,
			paymentStatus: "pending",
			purchaseNumber: testId("pn"),
		});
		const id = created?.id;
		expect(id, `create: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`pkg ${id}`, async () => {
			await rpcRaw(request, "packageInstances/cancel", {
				organizationId,
				id,
				reason: "E2E-DEEP cleanup",
			});
		});
		return created;
	}

	test("approval gate forces purchased packages to pending, then confirmPayment + assignTrainer activates", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(!fx.serviceId || !fx.clientId, "no service/client fixture");

		// Approval-gate invariant: purchased → forced status "pending".
		const created = await createPurchased(page.request, organizationId, fx);
		expect(created?.status).toBe("pending");

		// confirmPayment marks the payment without changing status.
		await rpc(page.request, "packageInstances/confirmPayment", {
			organizationId,
			packageInstanceId: created.id,
			paymentMethod: "cash",
		});

		// assignTrainer transitions pending → active.
		test.skip(!fx.trainerMemberId, "no trainer fixture for assignTrainer");
		const assigned = await rpc(page.request, "packageInstances/assignTrainer", {
			organizationId,
			packageInstanceId: created.id,
			trainerMemberId: fx.trainerMemberId,
		});
		expect(assigned?.status).toBe("active");
	});

	test("reject transitions a pending purchased package to cancelled", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(!fx.serviceId || !fx.clientId, "no service/client fixture");

		const created = await createPurchased(page.request, organizationId, fx);
		expect(created?.status).toBe("pending");

		const rejected = await rpc(page.request, "packageInstances/reject", {
			organizationId,
			packageInstanceId: created.id,
			reason: "E2E-DEEP reject",
		});
		expect(rejected?.status).toBe("cancelled");
	});
});
