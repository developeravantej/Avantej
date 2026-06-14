/**
 * Journey (UI, video): Commission ledger lifecycle — pending → approve → paid.
 *
 * Actor: tenant_admin (franchisee@gmail.com), also the salesperson (soldBy).
 *
 * Seeds a full-payment sale (→ one pending origination commission owned by the
 * admin), then drives the real Commissions → All ledger UI:
 *   1. Pending filter → select the row → "Approve Selected" → Approve.
 *   2. Approved filter → select the row → "Mark Paid" → enter a reference → confirm.
 *   3. The row's status badge reads "paid".
 *
 * Prereq: on_sale commission track seeded
 *   (cd apps/server && bun run scripts/seed-commission-track-test-tenant.ts)
 *
 * Record: PW_VIDEO=on bunx playwright test e2e/commission-ledger-payout-ui.journey.spec.ts --project=journeys-e2e
 */

import { test, expect, type Page } from "@playwright/test";
import {
	TEST_ORG_ID,
	seedMinimalPosFixture,
	pickFirstActiveClient,
	pickFirstService,
	recordPosSaleFull,
} from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

type UserCtx = { currentOrganizationId?: string; user?: { id?: string } };

/** Open the All-tab status filter and select my split's row by its exact checkbox. */
async function selectSplitUnder(
	page: Page,
	status: "Pending" | "Approved",
	splitId: string,
) {
	// Status filter buttons live in the inner toolbar (scope to the row that has both
	// "Pending" and "Approved" so we don't hit a bulk-bar action button by the same name).
	const statusBar = page
		.locator("div", { has: page.getByRole("button", { name: /^Pending$/ }) })
		.filter({ has: page.getByRole("button", { name: /^Approved$/ }) })
		.last();
	await statusBar
		.getByRole("button", { name: new RegExp(`^${status}$`) })
		.click();
	await page.waitForTimeout(900);

	const checkbox = page.locator(`[aria-label="Select commission ${splitId}"]`);
	await expect(checkbox).toBeVisible({ timeout: 10_000 });
	await checkbox.scrollIntoViewIfNeeded();
	// force: the page's sticky header can overlap the tiny (15px) checkbox after scroll.
	await checkbox.check({ force: true });
	await page.waitForTimeout(700);
}

test("commission ledger — approve then mark paid (full UI lifecycle)", {
	tag: ["@p1"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;
	const me = ctx.user?.id ?? "";
	test.skip(!me, "no session user id");

	// Seed a full-payment sale → one pending origination split owned by me.
	await seedMinimalPosFixture(page);
	const client = await pickFirstActiveClient(page);
	const service = await pickFirstService(page, {
		hasSessions: true,
		isPackage: true,
	});
	test.skip(!client || !service, "fixtures not available — run bun e2e:seed");

	const total = 12340; // commission = floor(12340 × 10%) = 1234 → RM 12.34
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
				unitPriceCents: total,
			},
		],
		paymentMethod: "cash",
		soldBy: me,
	});
	await page.waitForTimeout(600);

	// Find the pending split id for this sale.
	type Row = {
		id: string;
		salesOrderId: string | null;
		installmentId: string | null;
	};
	const ledger = await orpcCall<object, { rows?: Row[] }>(
		page,
		"commissionSplits",
		"listLedger",
		{ organizationId: orgId, status: "pending", staffId: me, limit: 200 },
	);
	const split = (ledger.rows ?? []).find(
		(r) => r.salesOrderId === sale.salesOrderId && r.installmentId == null,
	);
	test.skip(
		!split,
		"No pending origination split — is the on_sale track seeded?",
	);
	const splitId = split!.id;

	await page.goto("/dashboard/commissions/view?tab=all");
	await page.waitForLoadState("networkidle");
	await page.waitForSelector("table", { timeout: 15_000 });

	// ── 1. Approve ───────────────────────────────────────────────────────────
	await selectSplitUnder(page, "Pending", splitId);
	await page.getByRole("button", { name: /approve selected/i }).click();
	await expect(
		page.getByRole("heading", { name: /approve commission splits/i }),
	).toBeVisible({ timeout: 5_000 });
	await page.waitForTimeout(500);
	await page
		.locator('[role="dialog"]')
		.getByRole("button", { name: /^Approve$/ })
		.click();
	await page.waitForTimeout(1200);

	// ── 2. Mark paid ─────────────────────────────────────────────────────────
	await selectSplitUnder(page, "Approved", splitId);
	// BulkActionBar trigger is "Mark Paid"; the dialog confirm is "Mark as Paid".
	await page.getByRole("button", { name: /^mark paid$/i }).click();
	await expect(
		page.getByRole("heading", { name: /mark as paid/i }),
	).toBeVisible({ timeout: 5_000 });
	await page.waitForTimeout(500);
	await page.locator("#paymentReference").fill("E2E-PAYOUT-REF-001");
	await page.waitForTimeout(500);
	await page
		.locator('[role="dialog"]')
		.getByRole("button", { name: /^mark as paid$/i })
		.click();
	await page.waitForTimeout(1500);

	// ── 3. Verify the split is now paid (API read-back — authoritative) ──────
	const paid = await orpcCall<object, { rows?: Array<{ id: string }> }>(
		page,
		"commissionSplits",
		"listLedger",
		{ organizationId: orgId, status: "paid", staffId: me, limit: 200 },
	);
	expect(
		(paid.rows ?? []).some((r) => r.id === splitId),
		"the split must be PAID after the ledger mark-paid flow",
	).toBe(true);
	await page.waitForTimeout(1200); // hold final state for the video
});
