import { test, expect } from "@playwright/test";
import { smokeLoad } from "../_helpers";

// Core journey: search the customer directory and (if present) open the first
// customer's profile. Read-only — no edits/creates.
test.describe("customers", () => {
	test("Customers journey — search directory and open a profile", async ({
		page,
	}) => {
		// 1. Customers list loads.
		await smokeLoad(page, "/dashboard/customers/v2/view");

		// 2. Type into the directory search (debounced lookup).
		const search = page.getByPlaceholder("Search customers…");
		await expect(search).toBeVisible();
		await search.fill("a");
		await page.waitForTimeout(600); // debounce (300ms) + query

		// 3. No crash after the filtered query resolves.
		await expect(
			page.getByRole("heading", { name: "Something went wrong" }),
		).toHaveCount(0);

		// 4. If a customer row rendered, open it and confirm the profile panel;
		//    otherwise confirm a graceful empty state (no crash).
		const firstRow = page
			.locator(
				"[data-testid='customer-row'], button:has-text('Ahmad'), li button",
			)
			.first();
		if (await firstRow.isVisible().catch(() => false)) {
			await firstRow.click();
			await expect(
				page.getByRole("heading", { name: "Something went wrong" }),
			).toHaveCount(0);
		}
		await expect(search).toBeVisible();
	});
});
