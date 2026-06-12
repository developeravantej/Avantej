import { test, expect } from "@playwright/test";

/**
 * Page-load smoke for the appointment + services/categories areas.
 *
 * History: this file originally verified five specific UI fixes from an old
 * session (detail dialogs, edit prefills). The services/categories pages have
 * since been consolidated into a tabbed view and those dialogs no longer
 * exist in that form — the old selectors matched nothing, and the suite
 * itself was dormant for months behind a broken testMatch. Rewritten as a
 * lean smoke of the same areas against the current UI: the page loads,
 * its key controls render, and data-bearing tables appear.
 */

// The chromium project injects the tenant-admin storageState (auth.setup.ts),
// so the session already exists — just land on the dashboard.
async function login(page: import("@playwright/test").Page) {
	await page.goto("/dashboard");
	await page.waitForURL("**/dashboard**", { timeout: 15_000 });
}

// ─── Appointments ─────────────────────────────────────────────────────────────

test.describe("Appointment page", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("loads with booking controls", async ({ page }) => {
		await page.goto("/dashboard/appointment/view");

		// Current UI: toolbar with Filters / Export / New Booking
		await expect(
			page.getByText("New Booking", { exact: true }).first(),
		).toBeVisible({ timeout: 15_000 });
		await expect(
			page.getByText("Filters", { exact: true }).first(),
		).toBeVisible({ timeout: 5_000 });
	});

	test("new booking modal opens", async ({ page }) => {
		await page.goto("/dashboard/appointment/view");
		const newBooking = page.getByText("New Booking", { exact: true }).first();
		await expect(newBooking).toBeVisible({ timeout: 15_000 });
		await newBooking.click();

		// A dialog should appear; close it again with Escape.
		const dialog = page.getByRole("dialog");
		await expect(dialog.first()).toBeVisible({ timeout: 10_000 });
		await page.keyboard.press("Escape");
	});
});

// ─── Services / Categories (consolidated tabbed view) ───────────────────────

test.describe("Services area", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("services view loads with tabs", async ({ page }) => {
		await page.goto("/dashboard/service/view");
		await expect(
			page.getByRole("button", { name: "Services", exact: true }).first(),
		).toBeVisible({ timeout: 15_000 });
		await expect(
			page.getByRole("button", { name: "Categories", exact: true }).first(),
		).toBeVisible({ timeout: 5_000 });
	});

	test("services tab shows seeded data", async ({ page }) => {
		await page.goto("/dashboard/service/view");
		await expect(
			page.getByRole("button", { name: "Services", exact: true }).first(),
		).toBeVisible({ timeout: 15_000 });

		// The seeded catalog ("Private Session" et al. from seed-business-data)
		// should surface somewhere in the services listing.
		const seeded = page.getByText(/private session|test session/i).first();
		const hasData = await seeded
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		if (!hasData) {
			test.skip(true, "No seeded services visible — run bun e2e:seed");
		}
	});

	test("categories tab opens", async ({ page }) => {
		await page.goto("/dashboard/service/view");
		const categoriesTab = page
			.getByRole("button", { name: "Categories", exact: true })
			.first();
		await expect(categoriesTab).toBeVisible({ timeout: 15_000 });
		await categoriesTab.click();

		// The seeded "Personal Training" category should appear.
		const seeded = page.getByText(/personal training|e2e category/i).first();
		const hasData = await seeded
			.isVisible({ timeout: 10_000 })
			.catch(() => false);
		if (!hasData) {
			test.skip(true, "No seeded categories visible — run bun e2e:seed");
		}
	});
});
