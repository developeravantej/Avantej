import { test, expect } from "@playwright/test";

/**
 * Post-simplification verification of the Platform Admin surface against the
 * running dev app. Confirms the refactors (C1 gate consolidation, sidebar lean,
 * Billing money-tabs) did NOT break the platform-admin UI, and that the nav now
 * shows the 3 core primaries + a collapsible System group.
 *
 * Read-only journey — no tenant state is mutated.
 */

const PLATFORM_ADMIN = {
	email: "developer.avantej@gmail.com",
	password: "password1234",
};

test("Platform Admin surface — sidebar lean + Billing tabs (post-simplification)", async ({
	page,
}) => {
	await test.step("Log in as a platform admin", async () => {
		await page.goto("/login");
		const form = page.locator("form").first();
		await form.getByRole("textbox", { name: /email/i }).fill(PLATFORM_ADMIN.email);
		await form.locator('input[type="password"]').fill(PLATFORM_ADMIN.password);
		await form.getByRole("button", { name: "Login", exact: true }).click();
		await page.waitForURL("**/dashboard**", { timeout: 30_000 });
		await expect(page.locator("body")).toBeVisible();
	});

	await test.step("Primary nav shows the 3 core ops surfaces", async () => {
		for (const item of ["Mission Control", "Tenants", "Billing"]) {
			await expect(
				page.getByRole("link", { name: item, exact: true }).first(),
			).toBeVisible();
		}
	});

	await test.step("System group expands to reveal the secondary surfaces", async () => {
		await page.getByTestId("platform-admin-system-toggle").click();
		for (const item of ["Health", "Comms", "Webhooks", "Audit", "Users"]) {
			await expect(
				page.getByRole("link", { name: item, exact: true }).first(),
			).toBeVisible();
		}
	});

	await test.step("Tenants surface loads", async () => {
		await page.getByRole("link", { name: "Tenants", exact: true }).first().click();
		await page.waitForURL("**/platform-admin/tenants**", { timeout: 20_000 });
		await expect(page.locator("body")).toContainText(/tenant/i);
	});

	await test.step("Billing money-hub tabs render and navigate", async () => {
		await page.getByRole("link", { name: "Billing", exact: true }).first().click();
		await page.waitForURL("**/platform-admin/billing**", { timeout: 20_000 });
		await expect(page.getByTestId("money-hub-tabs")).toBeVisible();
		await page.getByTestId("money-hub-tab-revenue").click();
		await page.waitForURL("**/platform-admin/revenue**", { timeout: 20_000 });
		await expect(page.getByTestId("money-hub-tabs")).toBeVisible();
	});
});
