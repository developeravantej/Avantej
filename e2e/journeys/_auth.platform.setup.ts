import { test as setup, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FILE = path.join(__dirname, ".auth", "platform-admin.json");

const PLATFORM_ADMIN = {
	email: "developer.avantej@gmail.com",
	password: "password123",
};

setup("authenticate platform admin", async ({ page }) => {
	await page.goto("/login");

	const email = page.locator("input#email");
	await expect(email).toBeEnabled({ timeout: 60_000 });
	await email.fill(PLATFORM_ADMIN.email);
	await page.locator('input[type="password"]').fill(PLATFORM_ADMIN.password);
	await page.getByRole("button", { name: "Login", exact: true }).click();

	// Platform admin has no tenant org context — just wait for the dashboard shell.
	await page.waitForURL("**/dashboard**", { timeout: 45_000 });
	await expect(page.locator("body")).toBeVisible();

	await page.context().storageState({ path: AUTH_FILE });
});
