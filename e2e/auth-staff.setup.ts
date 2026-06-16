import { test as setup, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_FILE = path.join(__dirname, ".auth", "staff.json");

// Non-admin (staff) seed account — used to prove the launchpad gates cards and
// strip queries by permission without 403-ing the page. `||` not `??` so an
// unset CI secret (empty string) doesn't log in blank.
const STAFF_EMAIL =
	process.env.E2E_STAFF_EMAIL || "staff.deterministic@test.com";
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD || "password123";

setup("authenticate staff", async ({ page }) => {
	await page.goto("/login");

	const form = page.locator("form").first();
	await form.getByRole("textbox", { name: /email/i }).fill(STAFF_EMAIL);
	await form.locator('input[type="password"]').fill(STAFF_PASSWORD);
	await form.getByRole("button", { name: "Login", exact: true }).click();

	await page.waitForURL("**/dashboard**", { timeout: 25_000 });
	await page.waitForFunction(
		() => !!localStorage.getItem("current_organization_id"),
		{ timeout: 25_000, polling: 500 },
	);
	await expect(page.locator("body")).toBeVisible();

	await page.context().storageState({ path: AUTH_FILE });
});
