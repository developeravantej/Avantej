import { test, expect } from "@playwright/test";
import { smokeLoad } from "../_helpers";

// Dynamic detail: open the first customer from the directory and assert the
// profile panel renders real content. Read-only.
test.describe("customers", () => {
	test("Customer profile opens from the directory and shows profile content", async ({
		page,
	}) => {
		await smokeLoad(page, "/dashboard/customers/v2/view");
		const firstRow = page
			.locator(
				"[data-testid='customer-row'], table tbody tr, ul li button, [role='row']",
			)
			.filter({ hasNot: page.locator("th") })
			.first();
		if (!(await firstRow.isVisible().catch(() => false))) {
			test.skip(
				true,
				"no customer rows in this dataset — seed data to cover detail",
			);
			return;
		}
		await firstRow.click();
		await expect(
			page.getByRole("heading", { name: "Something went wrong" }),
		).toHaveCount(0);
		// The 360 profile panel shows tabs / contact info / a New Sale action.
		await expect(
			page.getByText(/profile|contact|overview|new sale|email|phone/i).first(),
		).toBeVisible({ timeout: 15_000 });
	});
});
