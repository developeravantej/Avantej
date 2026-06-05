import { test, expect } from "@playwright/test";
import { smokeLoad, waitForWithReload } from "../_helpers";

// Core journey: open the POS and exercise the customer step WITHOUT creating a
// sale (no add-to-cart, no payment) — read-only / non-destructive against live
// tenant data.
test.describe("sales", () => {
	test("POS journey — open New Sale and search a member (no submit)", async ({
		page,
	}) => {
		// 1. Sales list loads.
		await smokeLoad(page, "/dashboard/sales/view");

		// 2. Enter the POS create flow.
		await page.goto("/dashboard/sales/create", {
			waitUntil: "domcontentloaded",
		});

		// 3. Customer step renders — the member search box is the stable anchor.
		const memberSearch = page.getByTestId("pos-member-search-input");
		await waitForWithReload(page, memberSearch, {
			url: "/dashboard/sales/create",
		});

		// 4. Type a member name to drive the search (read-only lookup).
		await memberSearch.fill("Ahmad");
		// 5. The lookup resolves to either results or a no-match state — no crash.
		await expect(
			page.getByRole("heading", { name: "Something went wrong" }),
		).toHaveCount(0);
		await page.waitForTimeout(800); // debounce settle; assert still alive
		await expect(memberSearch).toBeVisible();
	});
});
