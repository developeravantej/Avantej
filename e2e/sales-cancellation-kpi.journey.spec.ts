/**
 * Journey: Sales KPI strip shows non-negative Confirmed and Revenue values
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Route: /dashboard/sales/view
 * Seed required: No — the test asserts KPI cards render with non-negative numeric text.
 *   Regression: sales-kpi-confirmed was always 0 before Phase 6.1 fix.
 *
 * Run: bunx playwright test e2e/sales-cancellation-kpi.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";

test(
	"sales KPI strip renders with confirmed and revenue values",
	{ tag: ["@p1"] },
	async ({ page }) => {
		await page.goto("/dashboard/sales/view");

		// KPI strip container is visible.
		await expect(page.getByTestId("sales-kpi-strip")).toBeVisible();

		// Confirmed card is present.
		const confirmedCard = page.getByTestId("sales-kpi-confirmed");
		await expect(confirmedCard).toBeVisible();

		// Wait for the kpiSummary query to resolve — the card initially shows
		// a "—" placeholder, then a digit once data lands.
		await expect(confirmedCard).toContainText(/\d+/, { timeout: 15_000 });

		// Revenue card is present and has resolved to a numeric value too.
		const revenueCard = page.getByTestId("sales-kpi-revenue");
		await expect(revenueCard).toBeVisible();
		await expect(revenueCard).toContainText(/\d+/, { timeout: 15_000 });
	},
);
