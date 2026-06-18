import { test, expect } from "@playwright/test";
import { seedMinimalPosFixture } from "./helpers/seed-data";

const serverOrigin =
	process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:3020";

test.describe("Smoke", () => {
	test("server health endpoint responds", async ({ request }) => {
		const res = await request.get(`${serverOrigin}/health`);
		expect(res.ok()).toBeTruthy();
		const body = await res.json();
		expect(body).toMatchObject({ status: "ok" });
	});

	test("dashboard loads after auth", async ({ page }) => {
		await page.goto("/dashboard");
		await expect(page).toHaveURL(/dashboard/);
		await expect(page.locator("body")).toBeVisible();
	});

	test("minimal POS fixture is available in test tenant", async ({ page }) => {
		const fixture = await seedMinimalPosFixture(page);
		expect(fixture.trainerId.length).toBeGreaterThan(0);
		expect(fixture.clientMemberId.length).toBeGreaterThan(0);
		expect(fixture.packageServiceId.length).toBeGreaterThan(0);
		expect(fixture.installmentPlanId.length).toBeGreaterThan(0);
	});
});
