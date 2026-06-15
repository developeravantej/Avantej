import { test, expect } from "@playwright/test";
import { smokeLoad } from "../_helpers";

// Core journey: switch between the commission tab pills (My Commissions -> All
// Commissions). Read-only — no adjustments created.
test.describe("commissions", () => {
	test("Commissions journey — switch from My to All Commissions tab", async ({
		page,
	}) => {
		// 1. Commissions page loads on the default "My Commissions" pill.
		await smokeLoad(page, "/dashboard/commissions/view");
		await expect(
			page.getByRole("button", { name: "My Commissions" }),
		).toBeVisible();

		// 2. Switch to the "All Commissions" pill (admin-visible).
		const allPill = page.getByRole("button", { name: "All Commissions" });
		await expect(allPill).toBeVisible();
		await allPill.click();

		// 3. The URL reflects the active tab and the panel re-renders without crash.
		await expect(page).toHaveURL(/tab=all/);
		await expect(
			page.getByRole("heading", { name: "Something went wrong" }),
		).toHaveCount(0);

		// 4. Content (a table or empty state) is present under the new tab.
		await expect(
			page.locator("h1, h2, h3, table, [role='table']").first(),
		).toBeVisible();
	});
});
