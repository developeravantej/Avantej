/**
 * Customer journey (UI, video): installment sale → per-installment commission →
 * approve → payout, shown in the commission ledger.
 *
 * The headline financial case. Plumbing (the installment sale + per-installment
 * payment confirmations) is API-seeded for determinism; the SHOWCASE — the
 * resulting per-installment commission rows moving pending → approved → paid — is
 * driven through the real Commissions → All ledger UI (the surface this session
 * owns and has proven).
 *
 * Prereq: on_sale commission track seeded
 *   (cd apps/server && bun run scripts/seed-commission-track-test-tenant.ts)
 *
 * Record: PW_VIDEO=on bunx playwright test e2e/customer-journey-installment.journey.spec.ts --project=journeys-e2e
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
type InstallmentRow = { id: string; installmentNumber: number };

/** Open the All-tab status filter, then check each of the given split rows. */
async function selectSplitsUnder(
	page: Page,
	status: "Pending" | "Approved",
	splitIds: string[],
) {
	const statusBar = page
		.locator("div", { has: page.getByRole("button", { name: /^Pending$/ }) })
		.filter({ has: page.getByRole("button", { name: /^Approved$/ }) })
		.last();
	await statusBar
		.getByRole("button", { name: new RegExp(`^${status}$`) })
		.click();
	await page.waitForTimeout(900);

	for (const id of splitIds) {
		const cb = page.locator(`[aria-label="Select commission ${id}"]`);
		await expect(cb).toBeVisible({ timeout: 10_000 });
		await cb.scrollIntoViewIfNeeded();
		await cb.check({ force: true });
		await page.waitForTimeout(350);
	}
}

test("customer journey — installment sale → per-installment commission → approve → paid", {
	tag: ["@p1"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;
	const me = ctx.user?.id ?? "";
	test.skip(!me, "no session user id");

	// ── Plumbing (API): an installment sale, all installments cleared ─────────
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

	const insts = await orpcCall<object, InstallmentRow[]>(
		page,
		"installments",
		"listByPackageInstance",
		{
			organizationId: orgId,
			packageInstanceId: sale.packageInstanceIds![0]!,
		},
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

	const ledger = await orpcCall<object, { rows?: LedgerRow[] }>(
		page,
		"commissionSplits",
		"listLedger",
		{ organizationId: orgId, status: "pending", staffId: me, limit: 200 },
	);
	const splitIds = (ledger.rows ?? [])
		.filter(
			(r) => r.salesOrderId === sale.salesOrderId && r.installmentId != null,
		)
		.map((r) => r.id);
	test.skip(
		splitIds.length === 0,
		"No per-installment commission — is the on_sale track seeded?",
	);

	// ── Showcase (UI): the per-installment commissions, approved then paid ────
	await page.goto("/dashboard/commissions/view?tab=all");
	await page.waitForLoadState("networkidle");
	await page.waitForSelector("table", { timeout: 15_000 });

	// Approve all per-installment splits at once.
	await selectSplitsUnder(page, "Pending", splitIds);
	await page.getByRole("button", { name: /approve selected/i }).click();
	await expect(
		page.getByRole("heading", { name: /approve commission splits/i }),
	).toBeVisible({ timeout: 5_000 });
	await page.waitForTimeout(600);
	await page
		.locator('[role="dialog"]')
		.getByRole("button", { name: /^Approve$/ })
		.click();
	await page.waitForTimeout(1300);

	// Mark them paid (the payout).
	await selectSplitsUnder(page, "Approved", splitIds);
	await page.getByRole("button", { name: /^mark paid$/i }).click();
	await expect(
		page.getByRole("heading", { name: /mark as paid/i }),
	).toBeVisible({ timeout: 5_000 });
	await page.waitForTimeout(500);
	await page.locator("#paymentReference").fill("E2E-INSTALLMENT-PAYOUT");
	await page.waitForTimeout(500);
	await page
		.locator('[role="dialog"]')
		.getByRole("button", { name: /^mark as paid$/i })
		.click();
	await page.waitForTimeout(1500);

	// ── Verify (API read-back): every per-installment split is PAID ──────────
	const paid = await orpcCall<object, { rows?: Array<{ id: string }> }>(
		page,
		"commissionSplits",
		"listLedger",
		{ organizationId: orgId, status: "paid", staffId: me, limit: 200 },
	);
	const paidIds = new Set((paid.rows ?? []).map((r) => r.id));
	for (const id of splitIds) {
		expect(paidIds.has(id), `installment commission ${id} must be PAID`).toBe(
			true,
		);
	}
	await page.waitForTimeout(1500); // hold final state for the video
});
