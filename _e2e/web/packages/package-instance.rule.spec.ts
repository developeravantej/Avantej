import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	expectRejected,
} from "../_safe-mutation";
import { getPkgFixtures, pkgWindow } from "../_pkg-fixtures";

// Package-instance domain invariants.
test.describe("packages — invariants", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("creditsRemaining is generated = creditsTotal - creditsUsed", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(!fx.serviceId || !fx.clientId, "no service/client fixture");
		const { startsAt, expiresAt } = pkgWindow();

		const created = await rpc(page.request, "packageInstances/create", {
			organizationId,
			serviceId: fx.serviceId,
			clientId: fx.clientId,
			source: "assigned",
			creditsTotal: 10,
			creditsUsed: 3,
			startsAt,
			expiresAt,
			totalPrice: 0,
			paymentStatus: "paid",
			purchaseNumber: testId("pn"),
		});
		const id = created?.id;
		expect(id, `create: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`pkg ${id}`, async () => {
			await rpcRaw(page.request, "packageInstances/cancel", {
				organizationId,
				id,
				reason: "E2E-DEEP cleanup",
			});
		});
		// Generated column: 10 - 3 = 7. The create input has no creditsRemaining
		// field at all — it cannot be written directly, only derived.
		expect(created?.creditsRemaining).toBe(7);
	});

	test("purchase_number is globally unique", async ({ page }) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(!fx.serviceId || !fx.clientId, "no service/client fixture");
		const { startsAt, expiresAt } = pkgWindow();
		const purchaseNumber = testId("pn-unique");

		const base = {
			organizationId,
			serviceId: fx.serviceId,
			clientId: fx.clientId,
			source: "assigned" as const,
			creditsTotal: 5,
			startsAt,
			expiresAt,
			totalPrice: 0,
			paymentStatus: "paid" as const,
		};

		const first = await rpc(page.request, "packageInstances/create", {
			...base,
			purchaseNumber,
		});
		const id = first?.id;
		expect(id, `first create: ${JSON.stringify(first)}`).toBeTruthy();
		cleanup.add(`pkg ${id}`, async () => {
			await rpcRaw(page.request, "packageInstances/cancel", {
				organizationId,
				id,
				reason: "E2E-DEEP cleanup",
			});
		});

		// Second create reusing the SAME purchaseNumber must be rejected.
		await expectRejected(
			page.request,
			"packageInstances/create",
			{ ...base, purchaseNumber },
			[400, 409, 500],
		);
	});

	test("assignTrainer requires status=pending (rejected on an active package)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(
			!fx.serviceId || !fx.clientId || !fx.trainerMemberId,
			"no service/client/trainer fixture",
		);
		const { startsAt, expiresAt } = pkgWindow();

		// assigned + paid → active (not pending).
		const created = await rpc(page.request, "packageInstances/create", {
			organizationId,
			serviceId: fx.serviceId,
			clientId: fx.clientId,
			source: "assigned",
			creditsTotal: 5,
			startsAt,
			expiresAt,
			totalPrice: 0,
			paymentStatus: "paid",
			purchaseNumber: testId("pn"),
		});
		const id = created?.id;
		expect(created?.status).toBe("active");
		cleanup.add(`pkg ${id}`, async () => {
			await rpcRaw(page.request, "packageInstances/cancel", {
				organizationId,
				id,
				reason: "E2E-DEEP cleanup",
			});
		});

		// assignTrainer on a non-pending package → BAD_REQUEST.
		await expectRejected(
			page.request,
			"packageInstances/assignTrainer",
			{
				organizationId,
				packageInstanceId: id,
				trainerMemberId: fx.trainerMemberId,
			},
			[400],
		);
	});

	test("installment plan price premium scales totalPrice and taxAmount", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(!fx.serviceId || !fx.clientId, "no service/client fixture");
		const { startsAt, expiresAt } = pkgWindow();

		// Dependency: a premium installment plan (1000 bps = +10%).
		const code = testId("plan");
		const plan = await rpc(page.request, "installmentPlans/create", {
			organizationId,
			code,
			name: `E2E-DEEP ${code}`,
			numInstallments: 3,
			defaultIntervalDays: 30,
			pricePremiumBps: 1000,
		});
		const planId = plan?.id;
		expect(planId, `plan create: ${JSON.stringify(plan)}`).toBeTruthy();
		cleanup.add(`plan ${planId}`, async () => {
			await rpcRaw(page.request, "installmentPlans/deactivate", {
				organizationId,
				id: planId,
			});
		});

		// Create a purchased instance on this plan; server scales the BASE price.
		const base = 5000;
		const baseTax = 100;
		const created = await rpc(page.request, "packageInstances/create", {
			organizationId,
			serviceId: fx.serviceId,
			clientId: fx.clientId,
			source: "purchased",
			creditsTotal: 10,
			startsAt,
			expiresAt,
			totalPrice: base,
			taxAmount: baseTax,
			paymentStatus: "pending",
			paymentPlanType: code,
			installmentIntervalDays: 30,
			purchaseNumber: testId("pn"),
		});
		const id = created?.id;
		expect(id, `create: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`pkg ${id}`, async () => {
			await rpcRaw(page.request, "packageInstances/cancel", {
				organizationId,
				id,
				reason: "E2E-DEEP cleanup",
			});
		});

		// (10000 + 1000) / 10000 = 1.1 → 5000→5500, 100→110.
		expect(created?.totalPrice).toBe(Math.round((base * 11000) / 10000));
		expect(created?.taxAmount).toBe(Math.round((baseTax * 11000) / 10000));
	});
});
