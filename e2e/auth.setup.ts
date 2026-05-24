import { test as setup, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_FILE = path.join(__dirname, ".auth", "tenant-admin.json");

const E2E_EMAIL = process.env.E2E_EMAIL ?? "franchisee@gmail.com";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "password123";

setup("authenticate", async ({ page }) => {
	await page.goto("/login");

	const form = page.locator("form").first();
	await form.getByRole("textbox", { name: /email/i }).fill(E2E_EMAIL);
	await form.locator('input[type="password"]').fill(E2E_PASSWORD);
	await form.getByRole("button", { name: "Login", exact: true }).click();

	// Wait for redirect to dashboard
	await page.waitForURL("**/dashboard**", { timeout: 25_000 });

	// Wait for useUserContext to write currentOrganizationId to localStorage.
	// The queryFn calls /rpc/auth/userContext and then writes to localStorage.
	// We poll localStorage until the key appears (avoids networkidle flakiness
	// caused by the app's polling intervals).
	await page.waitForFunction(
		() => !!localStorage.getItem("current_organization_id"),
		{ timeout: 25_000, polling: 500 },
	);

	await expect(page.locator("body")).toBeVisible();

	// Save auth state (captures cookies + localStorage)
	await page.context().storageState({ path: AUTH_FILE });
});
