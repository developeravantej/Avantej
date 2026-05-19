/**
 * Journey: Payouts page mounts with KPI strip and Run Batch drawer opens
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Route: /dashboard/payouts/view
 * Seed required: No — KPI cards render even with 0 values; drawer opens regardless.
 *
 * Run: bunx playwright test e2e/payouts-kpi-mounts.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";

test(
	"payouts page mounts with all three KPI cards visible",
	{ tag: ["@p1"] },
	async ({ page }) => {
		await page.goto("/dashboard/payouts/view");

		// KPI strip container.
		await expect(page.getByTestId("payouts-kpi-strip")).toBeVisible();

		// All three sub-cards must be present (values may be 0 — that is fine).
		await expect(page.getByTestId("payouts-kpi-pending")).toBeVisible();
		await expect(page.getByTestId("payouts-kpi-approved")).toBeVisible();
		await expect(page.getByTestId("payouts-kpi-paid")).toBeVisible();

		// Payouts table OR empty-state text must render once the query resolves.
		// The query runs async; give it up to 20s after the KPI strip appears.
		// Loading state shows a spinner (no testid), so we must wait for it to clear.
		await expect(
			page
				.getByTestId("payouts-table")
				.or(page.getByText(/no payouts yet/i))
				.first(),
		).toBeVisible({ timeout: 20_000 });

		// No "Coming soon" / redirect stub text visible inside the page main content.
		// (Scoped to <main> to avoid matching sidebar "Coming Soon" labels.)
		await expect(
			page.locator("main").getByText(/coming soon/i),
		).not.toBeVisible();
	},
);

test(
	"clicking Run Batch opens the batch drawer",
	{ tag: ["@p1"] },
	async ({ page }) => {
		await page.goto("/dashboard/payouts/view");
		await expect(page.getByTestId("payouts-kpi-strip")).toBeVisible();

		await page.getByTestId("run-batch-button").click();

		// Drawer should open.
		await expect(page.getByTestId("run-batch-drawer")).toBeVisible({ timeout: 8_000 });
	},
);
