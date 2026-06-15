/**
 * Journey: Payouts tab mounts with KPI cards and the Run Batch drawer opens
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Route: /dashboard/commissions/view?tab=payouts
 *
 * NOTE: the old /dashboard/payouts/view route 404s in the current build and its
 * payouts-kpi-strip / payouts-kpi-{pending,approved,paid} test-ids are dead
 * (the payouts-kpi-strip.tsx component is orphaned, not imported anywhere). The
 * live Payouts UI is a tab under the Commissions page with KPI cards labelled
 * "Disbursed (This Month)", "Pending Recipients", "Avg Payout", "Last Batch".
 *
 * Run: bunx playwright test e2e/payouts-kpi-mounts.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";

const PAYOUTS_URL = "/dashboard/commissions/view?tab=payouts";

test("payouts tab mounts with all KPI cards visible", { tag: ["@p1"] }, async ({
	page,
}) => {
	await page.goto(PAYOUTS_URL);
	await page.waitForLoadState("networkidle");

	// The four KPI cards (values may be 0 / "—" — that is fine).
	await expect(page.getByText(/disbursed \(this month\)/i)).toBeVisible({
		timeout: 10_000,
	});
	await expect(page.getByText(/pending recipients/i)).toBeVisible();
	await expect(page.getByText(/avg payout/i)).toBeVisible();
	await expect(page.getByText(/last batch/i)).toBeVisible();

	// The payout records section renders (table or empty state).
	await expect(
		page
			.getByText(/payout records/i)
			.or(page.getByText(/no payouts yet/i))
			.first(),
	).toBeVisible({ timeout: 20_000 });
});

test("clicking Run Batch opens the batch drawer", { tag: ["@p1"] }, async ({
	page,
}) => {
	await page.goto(PAYOUTS_URL);
	await page.waitForLoadState("networkidle");

	const runBatchBtn = page.getByRole("button", { name: /run batch/i });
	await expect(runBatchBtn).toBeVisible({ timeout: 10_000 });
	await runBatchBtn.click();

	await expect(page.getByTestId("run-batch-drawer")).toBeVisible({
		timeout: 8_000,
	});
});
