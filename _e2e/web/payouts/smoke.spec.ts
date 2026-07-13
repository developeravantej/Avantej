import { test, expect } from "@playwright/test";
import { smokeLoad } from "../_helpers";

// Smoke: the Payouts tab of the commissions page loads for the admin session
// and exposes the batch-run affordance. Read-only.
test.describe("payouts", () => {
	test("Payouts tab loads with KPI band and Run Batch control", async ({
		page,
	}) => {
		await smokeLoad(page, "/dashboard/commissions/view?tab=payouts");

		// The payouts surface mounted (toolbar label).
		await expect(page.getByText("Payout Records")).toBeVisible();

		// Admin holds commission_payout:process → the batch trigger is present.
		await expect(page.getByRole("button", { name: "Run Batch" })).toBeVisible();

		// Sub-tab pills render.
		await expect(
			page.getByRole("button", { name: "All Payouts" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Per Recipient" }),
		).toBeVisible();
	});
});
