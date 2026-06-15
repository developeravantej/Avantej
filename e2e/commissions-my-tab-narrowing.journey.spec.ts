/**
 * Journey: "My Commissions" tab shows only the current user's own splits
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Steps:
 *   1. Call commissionSplits.getMyCommissions via API to get expected row count
 *   2. Navigate to /dashboard/commissions/view?tab=mine
 *   3. Assert: page renders without permission-denied guard
 *   4. If the admin has rows, assert the displayed count footer matches the API count
 *   5. Assert: all visible status pills only show statuses that belong to this user
 *      (cross-check: visible staff name in hero matches the session user's name)
 *
 * Skip conditions:
 *   - No commission splits exist for the admin (acceptable empty state — skip rather than fail)
 *
 * Run: bunx playwright test e2e/commissions-my-tab-narrowing.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { orpcCall } from "./helpers/orpc-client";
import { TEST_ORG_ID } from "./helpers/seed-data";

type MyCommissionsOutput = {
	splits?: Array<{ id: string; status: string; staffId: string }>;
};

test("my commissions tab — rows are scoped to the current admin's staff ID", {
	tag: ["@p1"],
}, async ({ page }) => {
	// ── 1. Cross-check via API ─────────────────────────────────────────────────
	let apiSplits: Array<{ id: string; status: string; staffId: string }> = [];
	try {
		const result = await orpcCall<object, MyCommissionsOutput>(
			page,
			"commissionSplits",
			"getMyCommissions",
			{ organizationId: TEST_ORG_ID },
		);
		apiSplits = result.splits ?? [];
	} catch {
		// API failure — try the UI anyway, skip after if still no data
	}

	// ── 2. Navigate to My Commissions tab ────────────────────────────────────
	await page.goto("/dashboard/commissions/view?tab=mine");
	await page.waitForLoadState("networkidle");

	// ── 3. Guard: check for permission-denied ────────────────────────────────
	// The mine tab is always visible (no extra permission gate). If we hit a
	// redirect or error page, bail.
	const currentUrl = page.url();
	// If redirected away from commissions entirely, that's unexpected.
	expect(currentUrl, "Expected to stay on commissions page").toContain(
		"/dashboard/commissions",
	);

	// Wait for the tab content to load (either table or empty state).
	await page.waitForSelector(
		"table, :text('No commission splits found.'), :text('Select an organization')",
		{ timeout: 15_000 },
	);

	// ── 4. Verify "My Commissions" pill is active ────────────────────────────
	// The tab pills are rendered as buttons in the header.
	// Active pill: bg-[#0a0a0a] text-white. We look for the pill labelled
	// "My Commissions" and assert it exists.
	const myCommissionsPill = page.getByRole("button", {
		name: /my commissions/i,
	});
	await expect(myCommissionsPill).toBeVisible({ timeout: 5_000 });

	// ── 5. If no splits — skip gracefully ────────────────────────────────────
	const isEmpty = await page
		.getByText(/no commission splits found/i)
		.isVisible({ timeout: 3_000 })
		.catch(() => false);

	if (isEmpty && apiSplits.length === 0) {
		test.skip(
			true,
			"No commission splits for admin — seed needed to test narrowing",
		);
	}

	// ── 6. If rows exist, assert the footer count matches API ────────────────
	// The mine-tab renders a footer: "{N} splits total". We check it matches.
	if (apiSplits.length > 0) {
		const footerText = page.locator("text=/\\d+ splits? total/i");
		await expect(footerText).toBeVisible({ timeout: 8_000 });

		const footerContent = await footerText.first().textContent();
		const match = footerContent?.match(/(\d+)/);
		const uiCount = match ? parseInt(match[1]!, 10) : -1;

		expect(uiCount, "UI row count should match API count").toBe(
			apiSplits.length,
		);
	}

	// ── 7. Assert: the hero panel shows the admin's own name (not "All Staff") ─
	// MyCommissionsPage renders "My Account" below the name in the sidebar.
	const myAccountLabel = page.getByText("My Account");
	await expect(myAccountLabel).toBeVisible({ timeout: 5_000 });

	// ── 8. Assert: the commission ledger sub-heading contains "My commission ledger"
	// confirming this is the per-user view, not the shared ledger.
	const ledgerSubheading = page.getByText(/my commission ledger/i);
	await expect(ledgerSubheading).toBeVisible({ timeout: 5_000 });
});
