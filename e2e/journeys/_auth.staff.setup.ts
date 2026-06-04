import { test as setup, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FILE = path.join(__dirname, ".auth", "scoped-staff.json");

// Deterministic seed staff — role "staff", read-only permissions, scoped to a
// branch node. Password fixed by apps/server/scripts/backfill-seed-auth-passwords.ts.
const STAFF = { email: "staff.deterministic@test.com", password: "password123" };

setup("authenticate scoped staff", async ({ page }) => {
	await page.goto("/login");

	const email = page.locator("input#email");
	await expect(email).toBeEnabled({ timeout: 60_000 });
	await email.fill(STAFF.email);
	await page.locator('input[type="password"]').fill(STAFF.password);
	await page.getByRole("button", { name: "Login", exact: true }).click();

	await page.waitForURL("**/dashboard**", { timeout: 45_000 });
	await page.waitForFunction(() => !!localStorage.getItem("current_organization_id"), {
		timeout: 45_000,
		polling: 500,
	});
	await expect(page.locator("body")).toBeVisible();

	await page.context().storageState({ path: AUTH_FILE });
});
