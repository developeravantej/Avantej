import { test as setup, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FILE = path.join(__dirname, ".auth", "tenant-admin.json");

const ADMIN = { email: "franchisee@gmail.com", password: "password123" };

setup("authenticate tenant admin", async ({ page }) => {
	await page.goto("/login");

	// Inputs render `disabled` until the initial session-check settles (slow on a
	// cold wrangler start) — wait for enabled before filling.
	const email = page.locator("input#email");
	await expect(email).toBeEnabled({ timeout: 60_000 });
	await email.fill(ADMIN.email);
	await page.locator('input[type="password"]').fill(ADMIN.password);
	await page.getByRole("button", { name: "Login", exact: true }).click();

	await page.waitForURL("**/dashboard**", { timeout: 45_000 });

	// useUserContext writes current_organization_id to localStorage once
	// /rpc/auth/userContext resolves — poll for it (avoids networkidle flakiness).
	await page.waitForFunction(
		() => !!localStorage.getItem("current_organization_id"),
		{ timeout: 45_000, polling: 500 },
	);
	await expect(page.locator("body")).toBeVisible();

	await page.context().storageState({ path: AUTH_FILE });
});
