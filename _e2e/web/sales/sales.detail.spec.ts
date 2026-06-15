import { test, expect } from "@playwright/test";
import { smokeLoad } from "../_helpers";

// Dynamic $id detail: drive from the list to the first row's detail and assert
// the detail renders real content (not just no-crash). Read-only.
test.describe("sales", () => {
	test("Sale detail opens from the list and shows order content", async ({
		page,
	}) => {
		await smokeLoad(page, "/dashboard/sales/view");
		const firstRow = page
			.locator("table tbody tr, [data-testid='sales-row'], [role='row']")
			.filter({ hasNot: page.locator("th") })
			.first();
		if (!(await firstRow.isVisible().catch(() => false))) {
			test.skip(
				true,
				"no sales rows in this dataset — seed data to cover detail",
			);
			return;
		}
		await firstRow.click();
		// Either navigated to a detail route or opened a detail panel — assert content + no crash.
		await expect(
			page.getByRole("heading", { name: "Something went wrong" }),
		).toHaveCount(0);
		await expect(
			page.getByText(/total|amount|invoice|payment|order/i).first(),
		).toBeVisible({ timeout: 15_000 });
	});
});
