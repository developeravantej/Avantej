import { test } from "@playwright/test";
import { smokeLoad } from "../_helpers";

// Read-only page-load smoke for the Email settings page (sending domains,
// aliases, notification routing). Navigate + assert the route renders without
// crashing and stays authenticated. Never clicks anything.

test.describe("email-domains", () => {
	test("Settings → Email loads", async ({ page }) => {
		await smokeLoad(page, "/dashboard/settings/email");
	});
});
