/**
 * Journey: Cancelled Sales view is a real page (not a redirect stub)
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Route: /dashboard/cancelled-sales/view
 * Seed required: No — table may be empty; the assertion is that the page renders at all.
 *
 * Run: bunx playwright test e2e/sales-cancellation-list.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";

test(
	"sidebar link to Cancelled Sales exists and navigates to the list page",
	{ tag: ["@p1"] },
	async ({ page }) => {
		await page.goto("/dashboard/sales/view");

		// Sidebar link must be present in the navigation.
		const sidebarLink = page.getByTestId("sidebar-cancelled-sales");
		await expect(sidebarLink).toBeVisible();

		// Click it.
		await sidebarLink.click();

		// URL must end up at /dashboard/cancelled-sales/view — not a redirect.
		await expect(page).toHaveURL(/\/dashboard\/cancelled-sales\/view/, { timeout: 10_000 });

		// The cancelled sales table OR empty-state placeholder must render —
		// the assertion is that the page is no longer a redirect stub.
		const tableOrEmpty = page
			.getByTestId("cancelled-sales-table")
			.or(page.getByText(/no cancelled sales/i));
		await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10_000 });

		// Must NOT show a "coming soon" stub or redirect message in main content.
		// (Scoped to <main> to avoid matching sidebar "Coming Soon" labels.)
		await expect(
			page.locator("main").getByText(/coming soon/i),
		).not.toBeVisible();
	},
);
