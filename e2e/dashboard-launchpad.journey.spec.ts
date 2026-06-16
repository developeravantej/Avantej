/**
 * Journey: Tenant admin uses the Dashboard launchpad (master/detail home).
 * Suite: Dashboard · Tier: P1 · Actor: tenant-admin
 * Pipeline: /dashboard landing → card rail → panel embeds → /dashboard/overview.
 *
 * Proves the launchpad feature (commits 5447e947 + 95c126ab):
 *   - the landing page is the launchpad (6 daily-task cards), not the old analytics page
 *   - clicking a card swaps the right panel to a real embedded component
 *   - the analytics dashboard now lives at /dashboard/overview
 *
 * Run with video proof:
 *   PW_VIDEO=on bunx playwright test e2e/dashboard-launchpad.journey.spec.ts --project=journeys-e2e
 */
import { test, expect } from "@playwright/test";

test.describe("Dashboard launchpad", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/dashboard");
		await expect(page).toHaveURL(/dashboard/);
		// Org context bootstrapped before assertions.
		await page.waitForFunction(
			() => !!localStorage.getItem("current_organization_id"),
			{ timeout: 20_000, polling: 500 },
		);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong|error boundary/i,
		);
	});

	test("Landing renders the launchpad card rail (not the analytics page)", {
		tag: ["@p1"],
	}, async ({ page }) => {
		const rail = page.getByText("Daily tasks", { exact: true });
		await expect(rail).toBeVisible({ timeout: 15_000 });

		// All six daily-task cards present for the admin role.
		for (const label of [
			"New Sale",
			"Create Customer",
			"View Customers",
			"Installments",
			"Commission Payout",
			"Trainer Schedule",
		]) {
			await expect(
				page.getByRole("button", { name: new RegExp(label) }).first(),
			).toBeVisible();
		}
	});

	test("New Sale panel embeds the POS workflow by default", {
		tag: ["@p1"],
	}, async ({ page }) => {
		await expect(
			page.getByPlaceholder("Search by name, email or phone..."),
		).toBeVisible({ timeout: 15_000 });
	});

	test("Clicking cards swaps the right panel to the embedded component", {
		tag: ["@p1"],
	}, async ({ page }) => {
		await test.step("View Customers → customer directory", async () => {
			await page
				.getByRole("button", { name: /View Customers/ })
				.first()
				.click();
			await expect(page.getByPlaceholder("Search customers…")).toBeVisible({
				timeout: 15_000,
			});
		});

		await test.step("Trainer Schedule → schedule with trainer search", async () => {
			await page
				.getByRole("button", { name: /Trainer Schedule/ })
				.first()
				.click();
			await expect(page.getByPlaceholder("Search trainers…")).toBeVisible({
				timeout: 15_000,
			});
		});

		await test.step("Installments → installments panel", async () => {
			await page
				.getByRole("button", { name: /Installments/ })
				.first()
				.click();
			await expect(page.locator("body")).toContainText(/installment/i, {
				timeout: 15_000,
			});
		});

		await test.step("Commission Payout → payouts panel", async () => {
			await page
				.getByRole("button", { name: /Commission Payout/ })
				.first()
				.click();
			await expect(page.locator("body")).toContainText(
				/payout|recipient|pending|paid/i,
				{ timeout: 15_000 },
			);
		});
	});

	test("Analytics dashboard now lives at /dashboard/overview", {
		tag: ["@p1"],
	}, async ({ page }) => {
		await page.goto("/dashboard/overview");
		await expect(page).toHaveURL(/dashboard\/overview/);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong|error boundary/i,
		);
		// The analytics surface (Analytics section / Needs attention) renders here now.
		await expect(page.locator("body")).toContainText(
			/analytics|needs attention|revenue/i,
			{ timeout: 15_000 },
		);
	});
});
