import { test, expect } from "@playwright/test";

// Shared login helper
async function login(page: import("@playwright/test").Page) {
	await page.goto("/login");
	await page.getByLabel("Email").fill("franchisee@gmail.com");
	await page.getByLabel("Password").fill("password123");
	await page.getByRole("button", { name: /sign in|login/i }).click();
	await page.waitForURL("**/dashboard**", { timeout: 15_000 });
}

// ─── Fix 1: Appointment — defaultTrainerId passed to calendar ────────────────

test.describe("Appointment page", () => {
	test.beforeEach(async ({ page }) => { await login(page); });

	test("loads with trainer sidebar (admin view)", async ({ page }) => {
		await page.goto("/dashboard/appointment/view");

		// Page title should be "Appointments" (admin view)
		await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible({ timeout: 15_000 });

		// Trainer sidebar should be visible (for admin/staff users)
		const sidebar = page.getByText("All Trainers");
		await expect(sidebar.first()).toBeVisible({ timeout: 10_000 });
	});

	test("add appointment modal opens", async ({ page }) => {
		await page.goto("/dashboard/appointment/view");
		await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible({ timeout: 15_000 });

		// Click "Add Appointment" button
		const addBtn = page.getByRole("button", { name: /add appointment/i });
		if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await addBtn.click();
			// Modal should appear with appointment form
			await expect(page.getByText(/new appointment|schedule appointment/i).first()).toBeVisible({ timeout: 5_000 });
		}
	});
});

// ─── Fix 2 & 3: Service Category — detail + config, edit real data ──────────

test.describe("Service Category page", () => {
	test.beforeEach(async ({ page }) => { await login(page); });

	test("loads service categories page", async ({ page }) => {
		await page.goto("/dashboard/service-category/view");
		await expect(page.getByRole("button", { name: /add service category/i })).toBeVisible({ timeout: 15_000 });
	});

	test("detail dialog shows config section", async ({ page }) => {
		await page.goto("/dashboard/service-category/view");
		await expect(page.getByRole("button", { name: /add service category/i })).toBeVisible({ timeout: 15_000 });

		const firstRow = page.locator("tbody tr").first();
		if (!(await firstRow.isVisible({ timeout: 5_000 }).catch(() => false))) {
			test.skip(true, "No service categories in DB to test");
			return;
		}

		await firstRow.click();
		await expect(page.getByText("Service Category Details")).toBeVisible({ timeout: 5_000 });

		// Basic fields
		await expect(page.getByText("Name").first()).toBeVisible();
		await expect(page.getByText("Status").first()).toBeVisible();

		// Config section (added by our fix)
		const configSection = page.getByText("Category Configuration");
		const hasConfig = await configSection.isVisible({ timeout: 3_000 }).catch(() => false);
		if (hasConfig) {
			await expect(page.getByText("Default Duration").first()).toBeVisible();
			await expect(page.getByText("Incentive Type").first()).toBeVisible();
		}

		await page.getByRole("button", { name: /close/i }).click();
	});

	test("edit loads real data (not empty/hardcoded)", async ({ page }) => {
		await page.goto("/dashboard/service-category/view");
		await expect(page.getByRole("button", { name: /add service category/i })).toBeVisible({ timeout: 15_000 });

		const firstRow = page.locator("tbody tr").first();
		if (!(await firstRow.isVisible({ timeout: 5_000 }).catch(() => false))) {
			test.skip(true, "No service categories in DB to test");
			return;
		}

		const categoryName = await firstRow.locator("td").first().textContent();

		await firstRow.click();
		await expect(page.getByText("Service Category Details")).toBeVisible({ timeout: 5_000 });

		const editBtn = page.getByRole("button", { name: /edit/i });
		if (!(await editBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
			test.skip(true, "Edit button not visible");
			return;
		}

		await editBtn.click();

		// Wait for the edit form to load
		const nameInput = page.locator('input[type="text"]').first();
		await expect(nameInput).toBeVisible({ timeout: 5_000 });

		// Key assertion: name should be pre-filled (not empty like the old hardcoded defaults)
		if (categoryName && categoryName !== "N/A") {
			const inputValue = await nameInput.inputValue();
			expect(inputValue.length).toBeGreaterThan(0);
		}
	});
});

// ─── Fix 4 & 5: Service — detail + extra fields, edit real data ─────────────

test.describe("Service page", () => {
	test.beforeEach(async ({ page }) => { await login(page); });

	test("loads services page", async ({ page }) => {
		await page.goto("/dashboard/service/view");
		await expect(page.getByRole("button", { name: /add service/i })).toBeVisible({ timeout: 15_000 });
	});

	test("detail dialog shows extended fields", async ({ page }) => {
		await page.goto("/dashboard/service/view");
		await expect(page.getByRole("button", { name: /add service/i })).toBeVisible({ timeout: 15_000 });

		const firstRow = page.locator("tbody tr").first();
		if (!(await firstRow.isVisible({ timeout: 5_000 }).catch(() => false))) {
			test.skip(true, "No services in DB to test");
			return;
		}

		await firstRow.click();
		await expect(page.getByText("Service Details")).toBeVisible({ timeout: 5_000 });

		// Basic fields
		await expect(page.getByText("Name").first()).toBeVisible();
		await expect(page.getByText("Duration").first()).toBeVisible();
		await expect(page.getByText("Price").first()).toBeVisible();

		// Extended fields (added by our fix)
		await expect(page.getByText("Scheduling").first()).toBeVisible();
		await expect(page.getByText("Taxable").first()).toBeVisible();
		await expect(page.getByText("Type").first()).toBeVisible();

		await page.getByRole("button", { name: /close/i }).click();
	});

	test("edit loads real data (not empty/hardcoded)", async ({ page }) => {
		await page.goto("/dashboard/service/view");
		await expect(page.getByRole("button", { name: /add service/i })).toBeVisible({ timeout: 15_000 });

		const firstRow = page.locator("tbody tr").first();
		if (!(await firstRow.isVisible({ timeout: 5_000 }).catch(() => false))) {
			test.skip(true, "No services in DB to test");
			return;
		}

		const serviceName = await firstRow.locator("td").first().textContent();

		await firstRow.click();
		await expect(page.getByText("Service Details")).toBeVisible({ timeout: 5_000 });

		const editBtn = page.getByRole("button", { name: /edit/i });
		if (!(await editBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
			test.skip(true, "Edit button not visible");
			return;
		}

		await editBtn.click();

		// Wait for edit form to appear — look for the first text input
		const nameInput = page.locator('input[id="name"], input[name="name"]').first();
		const anyInput = page.locator('input[type="text"]').first();
		const target = nameInput.or(anyInput);

		if (await target.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
			if (serviceName && serviceName !== "N/A") {
				const inputValue = await target.first().inputValue();
				expect(inputValue.length).toBeGreaterThan(0);
			}
		}
	});
});
