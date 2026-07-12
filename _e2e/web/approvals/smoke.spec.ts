import { test } from "@playwright/test";
import { smokeLoad } from "../_helpers";

// Read-only page-load smoke for the approvals inbox: navigate + assert the
// route renders without crashing and stays authenticated.

test.describe("approvals", () => {
	test("Approvals inbox loads", async ({ page }) => {
		await smokeLoad(page, "/dashboard/operations/approvals");
	});
});
