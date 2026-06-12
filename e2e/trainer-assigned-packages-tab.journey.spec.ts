/**
 * Journey: Trainer Assigned Packages tab loads on My Services page
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Route: /dashboard/my-services/view
 * Seed required: No — empty state is a valid pass; table presence is asserted, not row count.
 *
 * Run: bunx playwright test e2e/trainer-assigned-packages-tab.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";

test("Assigned Packages tab is accessible and renders table or empty state", {
	tag: ["@p1"],
}, async ({ page }) => {
	await page.goto("/dashboard/my-services/view");

	// Click the Assigned Packages tab.
	const tab = page.getByTestId("tab-assigned-packages");
	await expect(tab).toBeVisible();
	await tab.click();

	// URL should reflect the tab selection.
	await expect(page).toHaveURL(/[?&]tab=assigned/, { timeout: 8_000 });

	// Either the table or the empty state must be in the DOM — NOT an error page.
	const table = page.getByTestId("assigned-packages-table");
	const emptyState = page.getByTestId("assigned-packages-empty");

	await expect(table.or(emptyState)).toBeVisible({ timeout: 8_000 });
});
