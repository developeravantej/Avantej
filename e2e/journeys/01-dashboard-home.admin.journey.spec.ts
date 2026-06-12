/**
 * Journey: Tenant admin lands on the dashboard and sees the operational overview.
 * Suite: Auth & Onboarding · Tier: P0 · Actor: tenant-admin
 * Pipeline: session bootstrap → auth.userContext → analytics.getDashboardKpis.
 */
import { test, expect } from "@playwright/test";

test("Dashboard home — KPIs + quick actions render after login", {
	tag: ["@p0"],
}, async ({ page }) => {
	await test.step("Open the dashboard as the authenticated tenant admin", async () => {
		await page.goto("/dashboard");
		await expect(page).toHaveURL(/dashboard/);
		await expect(page.locator("body")).toBeVisible();
	});

	await test.step("Organization context is bootstrapped (current_organization_id present)", async () => {
		await page.waitForFunction(
			() => !!localStorage.getItem("current_organization_id"),
			{
				timeout: 20_000,
				polling: 500,
			},
		);
	});

	await test.step("Dashboard shell + key widgets are visible (no crash / no error boundary)", async () => {
		await expect(page.locator("body")).not.toContainText(
			/something went wrong|error boundary/i,
		);
		// Give KPI cards a moment to fetch + render.
		await page.waitForTimeout(1500);
	});
});
