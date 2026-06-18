/**
 * Customer journey (UI, video): refund → commission clawback.
 *
 * An installment sale earns per-installment commissions, then the package is
 * refunded — which voids the pending commission. Plumbing (sale, confirms,
 * processRefund) is API-driven; the SHOWCASE is the commission ledger: the
 * earned commissions under Pending, then the same rows under Void after the
 * refund claws them back.
 *
 * Prereq: on_sale commission track seeded.
 * Record: PW_VIDEO=on bunx playwright test e2e/customer-journey-refund.journey.spec.ts --project=journeys-e2e
 */

import { test, expect, type Page } from "@playwright/test";
import {
	TEST_ORG_ID,
	seedMinimalPosFixture,
	pickFirstActiveClient,
	pickFirstService,
	pickFirstInstallmentPlan,
	recordPosSaleFull,
} from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

type UserCtx = { currentOrganizationId?: string; user?: { id?: string } };
type LedgerRow = {
	id: string;
	salesOrderId: string | null;
	installmentId: string | null;
};
type InstallmentRow = {
	id: string;
	installmentNumber: number;
	amount: number;
	taxAmount: number | null;
	amountPaid: number | null;
};

async function clickStatusFilter(page: Page, status: string) {
	const statusBar = page
		.locator("div", { has: page.getByRole("button", { name: /^Pending$/ }) })
		.filter({ has: page.getByRole("button", { name: /^Approved$/ }) })
		.last();
	await statusBar
		.getByRole("button", { name: new RegExp(`^${status}$`) })
		.click();
	await page.waitForTimeout(1000);
}

test("customer journey — refund voids (claws back) the earned commission", {
	tag: ["@p1"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;
	const me = ctx.user?.id ?? "";
	test.skip(!me, "no session user id");

	// ── Plumbing: installment sale + confirms → per-installment commissions ───
	await seedMinimalPosFixture(page);
	const client = await pickFirstActiveClient(page);
	const service = await pickFirstService(page, {
		hasSessions: true,
		isPackage: true,
	});
	const plan = await pickFirstInstallmentPlan(page);
	test.skip(
		!client || !service || !plan || plan.numInstallments < 2,
		"fixtures not available — run bun e2e:seed",
	);

	const n = plan!.numInstallments;
	const sale = await recordPosSaleFull(page, {
		customerId: client!.userId,
		customerName: client!.name,
		branchId: client!.hierarchyScopeId!,
		items: [
			{
				type: "package",
				refId: service!.id,
				description: service!.name,
				quantity: 1,
				unitPriceCents: n * 3000,
			},
		],
		paymentMethod: "cash",
		installmentPlanCode: plan!.code,
		soldBy: me,
	});
	const packageInstanceId = sale.packageInstanceIds![0]!;

	const insts = await orpcCall<object, InstallmentRow[]>(
		page,
		"installments",
		"listByPackageInstance",
		{ organizationId: orgId, packageInstanceId },
	);
	const sorted = [...insts].sort(
		(a, b) => a.installmentNumber - b.installmentNumber,
	);
	for (let i = 1; i < n; i++) {
		await orpcCall(page, "installments", "confirmPayment", {
			organizationId: orgId,
			installmentId: sorted[i]!.id,
			paymentMethod: "cash",
		});
	}
	await page.waitForTimeout(600);

	const before = await orpcCall<object, { rows?: LedgerRow[] }>(
		page,
		"commissionSplits",
		"listLedger",
		{ organizationId: orgId, status: "pending", staffId: me, limit: 200 },
	);
	const splitIds = (before.rows ?? [])
		.filter(
			(r) => r.salesOrderId === sale.salesOrderId && r.installmentId != null,
		)
		.map((r) => r.id);
	test.skip(
		splitIds.length === 0,
		"No per-installment commission — track seeded?",
	);

	// ── Showcase part 1 (UI): the earned commissions sit under Pending ────────
	await page.goto("/dashboard/commissions/view?tab=all");
	await page.waitForLoadState("networkidle");
	await page.waitForSelector("table", { timeout: 15_000 });
	await clickStatusFilter(page, "Pending");
	const firstPending = page.locator(
		`[aria-label="Select commission ${splitIds[0]}"]`,
	);
	await expect(firstPending).toBeVisible({ timeout: 10_000 });
	await firstPending.scrollIntoViewIfNeeded();
	await page.waitForTimeout(1200); // let the viewer see the earned commissions

	// ── Plumbing: refund the package → voids the pending commission ───────────
	const inst1 = sorted[0]!;
	const refundAmount =
		inst1.amountPaid ?? inst1.amount + (inst1.taxAmount ?? 0);
	const refund = await orpcCall<
		object,
		{ success: boolean; voidedCommissionCount: number }
	>(page, "installments", "processRefund", {
		organizationId: orgId,
		packageInstanceId,
		amount: refundAmount,
		reason: "E2E customer-journey refund",
	});
	expect(refund.success).toBe(true);

	// ── Showcase part 2 (UI): the same commissions now sit under Void ─────────
	await page.goto("/dashboard/commissions/view?tab=all");
	await page.waitForLoadState("networkidle");
	await page.waitForSelector("table", { timeout: 15_000 });
	await clickStatusFilter(page, "Void");
	await expect(
		page
			.getByTestId("commission-status-badge")
			.filter({ hasText: /^void$/i })
			.first(),
	).toBeVisible({ timeout: 10_000 });
	await page.waitForTimeout(1500); // hold the clawed-back state for the video

	// ── Verify (API): every earned split is now void ─────────────────────────
	const after = await orpcCall<object, { rows?: Array<{ id: string }> }>(
		page,
		"commissionSplits",
		"listLedger",
		{ organizationId: orgId, status: "void", staffId: me, limit: 200 },
	);
	const voided = new Set((after.rows ?? []).map((r) => r.id));
	for (const id of splitIds) {
		expect(voided.has(id), `commission ${id} must be void after refund`).toBe(
			true,
		);
	}
});
