/**
 * Journey: Installment-plan POS sale creates the correct number of installment rows
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P0
 *
 * Preconditions:
 * - An installment plan with numInstallments >= 2 exists and is active
 * - A package-style service exists in the catalog
 * - A client member exists
 *
 * Read-back is deterministic: pos.recordSale returns packageInstanceIds, so we
 * query installments.listByPackageInstance directly — no paginated-overview
 * matching, no UI fallback, no skips.
 *
 * Run: bunx playwright test e2e/pos-checkout-installment-schedule.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	seedMinimalPosFixture,
	pickFirstActiveClient,
	pickFirstService,
	pickFirstInstallmentPlan,
	recordPosSaleFull,
	TEST_ORG_ID,
} from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

test("installment-plan POS sale creates correct number of installment rows", {
	tag: ["@p0"],
}, async ({ page }) => {
	// ── Precondition checks ──────────────────────────────────────────────────
	await seedMinimalPosFixture(page);
	const client = await pickFirstActiveClient(page);
	const service = await pickFirstService(page, {
		hasSessions: true,
		isPackage: true,
	});
	const plan = await pickFirstInstallmentPlan(page);
	expect(client, "active client must exist (run bun e2e:seed)").not.toBeNull();
	expect(
		service,
		"package service must exist (run bun e2e:seed)",
	).not.toBeNull();
	expect(plan, "installment plan must exist (run bun e2e:seed)").not.toBeNull();

	// Use client's hierarchyScopeId as branchId — always a valid scope for the client
	const branchId = client!.hierarchyScopeId!;

	// ── Act: place POS sale with the installment plan ────────────────────────
	// NOTE: installment plan requires exactly one item of type "package" (not "service")
	const totalCents = 12000; // RM 120 — divisible to produce clean installments
	const sale = await recordPosSaleFull(page, {
		customerId: client!.userId,
		customerName: client!.name,
		branchId,
		items: [
			{
				type: "package", // must be "package" type for installment plan to apply
				refId: service!.id,
				description: service!.name,
				quantity: 1,
				unitPriceCents: totalCents,
			},
		],
		paymentMethod: "cash",
		installmentPlanCode: plan!.code,
	});

	expect(sale.salesOrderId, "salesOrderId must be returned").toBeTruthy();
	expect(
		sale.packageInstanceIds?.length ?? 0,
		"recordSale must return the package instance created for the package item",
	).toBeGreaterThan(0);
	const packageInstanceId = sale.packageInstanceIds![0]!;

	// recordSale also reports the installment rows it created
	expect(
		sale.installmentIds?.length ?? 0,
		`recordSale must create ${plan!.numInstallments} installments for plan "${plan!.code}"`,
	).toBe(plan!.numInstallments);

	// ── Assert: read the schedule back via the API ───────────────────────────
	type InstallmentRow = {
		id: string;
		installmentNumber: number;
		amount: number;
		status: string;
		dueDate?: string | null;
	};
	const rows = await orpcCall<object, InstallmentRow[]>(
		page,
		"installments",
		"listByPackageInstance",
		{
			organizationId: TEST_ORG_ID,
			packageInstanceId,
		},
	);

	// Core assertion: exactly plan.numInstallments rows
	expect(
		rows.length,
		`Expected ${plan!.numInstallments} installment rows for plan "${plan!.code}", got ${rows.length}. packageInstanceId: ${packageInstanceId}`,
	).toBe(plan!.numInstallments);

	// Per-row amounts: principal split evenly, remainder on the LAST installment
	// (calculateInstallmentAmounts in installment.service.ts). Test tax rate is
	// 0 bps and no promo applies, so principal = the item price.
	const n = plan!.numInstallments;
	const base = Math.floor(totalCents / n);
	const remainder = totalCents - base * n;
	const sorted = [...rows].sort(
		(a, b) => a.installmentNumber - b.installmentNumber,
	);
	for (let i = 0; i < n; i++) {
		const expected = i === n - 1 ? base + remainder : base;
		expect(sorted[i]!.amount, `installment #${i + 1} amount`).toBe(expected);
	}

	// Installment #1 is collected at the counter (auto-confirmed → paid);
	// the rest remain pending.
	expect(sorted[0]!.status, "installment #1 is paid at the counter").toBe(
		"paid",
	);
	for (let i = 1; i < n; i++) {
		expect(sorted[i]!.status, `installment #${i + 1} status`).toBe("pending");
	}
});
