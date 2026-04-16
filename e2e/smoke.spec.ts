import { test, expect } from "@playwright/test";

test("dashboard loads after auth", async ({ page }) => {
	await page.goto("/dashboard");
	// Should be on dashboard, not redirected to login
	await expect(page).toHaveURL(/dashboard/);
});
