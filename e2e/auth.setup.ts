import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

setup("authenticate", async ({ page }) => {
	await page.goto("/login");

	// Fill login form
	await page.getByLabel("Email").fill("franchisee@gmail.com");
	await page.getByLabel("Password").fill("password123");
	await page.getByRole("button", { name: /sign in|login/i }).click();

	// Wait for redirect to dashboard
	await page.waitForURL("**/dashboard**", { timeout: 15_000 });
	await expect(page.locator("body")).toBeVisible();

	// Save auth state
	await page.context().storageState({ path: AUTH_FILE });
});
