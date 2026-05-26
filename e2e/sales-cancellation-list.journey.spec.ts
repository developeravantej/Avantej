/**
 * Journey: Cancelled Sales tab is a real view (not a redirect stub)
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Route: /dashboard/sales/view?tab=cancelled
 *   (The old /dashboard/cancelled-sales/view route now redirects here — Cancelled Sales
 *   was merged into the Sales & Payments page as a pill tab in the f7290ae9 refactor.)
 * Seed required: No — table may be empty; the assertion is that the tab renders at all.
 *
 * Run: bunx playwright test e2e/sales-cancellation-list.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";

test(
	"Cancelled Sales tab on Sales & Payments page renders the cancellation list",
	{ tag: ["@p1"] },
	async ({ page }) => {
		// Navigate directly to the sales page with the cancelled tab active.
		// The old /dashboard/cancelled-sales/view route redirects here automatically.
		await page.goto("/dashboard/sales/view");

		// The "Cancelled" pill tab must be present.
		const cancelledTab = page.getByTestId("sales-tab-cancelled");
		await expect(cancelledTab).toBeVisible();

		// Click it.
		await cancelledTab.click();

		// URL must include the cancelled tab search param.
		await expect(page).toHaveURL(/tab=cancelled/, { timeout: 10_000 });

		// The cancelled sales table OR empty-state placeholder must render.
		const tableOrEmpty = page
			.getByTestId("cancelled-sales-table")
			.or(page.getByText(/no cancelled sales/i));
		await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10_000 });

		// Must NOT show a "coming soon" stub in main content.
		await expect(
			page.locator("main").getByText(/coming soon/i),
		).not.toBeVisible();
	},
);
