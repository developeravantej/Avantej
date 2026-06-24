/**
 * Journey: Tenant admin uses the Dashboard launchpad (master/detail home).
 * Suite: Dashboard · Tier: P1 · Actor: tenant-admin
 * Pipeline: /dashboard landing → card rail → panel embeds → /dashboard/overview.
 *
 * Proves the launchpad feature (commits 5447e947 + 95c126ab):
 *   - the landing page is the launchpad (8 daily-task cards), not the old analytics page
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

		// All daily-task cards present for the admin role.
		for (const label of [
			"New Sale",
			"Create Customer",
			"View Customers",
			"Renewals / Expiring",
			"Installments",
			"Refunds & Cancellations",
			"Commission Payout",
			"Trainer Schedule",
		]) {
			await expect(
				page.getByRole("button", { name: new RegExp(label) }).first(),
			).toBeVisible();
		}
	});

	test("Cards surface live count badges", { tag: ["@p1"] }, async ({
		page,
	}) => {
		await expect(page.getByText("Daily tasks", { exact: true })).toBeVisible({
			timeout: 15_000,
		});
		// At least one card shows a numeric badge (installments due / payouts
		// pending / appointments today). Asserts presence, not a brittle value.
		const badge = page
			.locator("button")
			.locator("span.rounded-full")
			.filter({ hasText: /^\d/ })
			.first();
		await expect(badge).toBeVisible({ timeout: 15_000 });
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

	test("Renewals card → memberships worklist panel", {
		tag: ["@p1"],
	}, async ({ page }) => {
		await page
			.getByRole("button", { name: /Renewals \/ Expiring/ })
			.first()
			.click();
		// MembershipsPage exposes the expiry-status tabs (Active / Expiring / Frozen / Expired).
		await expect(page.locator("body")).toContainText(/expiring|frozen/i, {
			timeout: 15_000,
		});
	});

	test("Refunds card → review queue, toggles to cancelled sales", {
		tag: ["@p1"],
	}, async ({ page }) => {
		await test.step("Refunds → refund review queue (RefundsTab)", async () => {
			await page
				.getByRole("button", { name: /Refunds & Cancellations/ })
				.first()
				.click();
			// RefundsTab's search box is the stable signal the queue mounted.
			await expect(page.getByPlaceholder("Search refunds…")).toBeVisible({
				timeout: 15_000,
			});
		});

		await test.step("Toggle → Cancellations (CancelledSalesTab)", async () => {
			// The toggle label is CSS-capitalized; its accessible name is the raw
			// lowercase "cancellations" (anchored so it doesn't match the card).
			await page.getByRole("button", { name: /^cancellations$/i }).click();
			// CancelledSalesTab's distinct search placeholder confirms the swap.
			await expect(
				page.getByPlaceholder("Search sale ID, customer, staff…"),
			).toBeVisible({ timeout: 15_000 });
		});
	});

	test("Keep-alive: New Sale state survives switching cards", {
		tag: ["@p1"],
	}, async ({ page }) => {
		const posSearch = page.getByPlaceholder(
			"Search by name, email or phone...",
		);
		await expect(posSearch).toBeVisible({ timeout: 15_000 });
		await posSearch.fill("keepalive-probe");

		// Switch away to another panel, then back to New Sale.
		await page
			.getByRole("button", { name: /View Customers/ })
			.first()
			.click();
		await expect(page.getByPlaceholder("Search customers…")).toBeVisible({
			timeout: 15_000,
		});
		await page
			.getByRole("button", { name: /New Sale/ })
			.first()
			.click();

		// The POS panel stayed mounted, so the typed value is preserved.
		await expect(
			page.getByPlaceholder("Search by name, email or phone..."),
		).toHaveValue("keepalive-probe", { timeout: 15_000 });
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
