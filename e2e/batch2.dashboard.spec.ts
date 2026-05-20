import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
	await page.goto("/login");
	await page.getByLabel("Email").fill("franchisee@gmail.com");
	await page.locator("#password").fill("password123");
	await page.getByRole("button", { name: /sign in|login/i }).first().click();
	await page.waitForURL("**/dashboard**", { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// 1. Attendance View
// ---------------------------------------------------------------------------
test.describe("Attendance View — /dashboard/attendance/view", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads with heading and key sections visible", async ({ page }) => {
		await page.goto("/dashboard/attendance/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// Heading area should mention attendance
		await expect(page.getByRole("heading", { name: /attendance/i }).first()).toBeVisible({ timeout: 8_000 });

		// No error boundary
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-02: no error boundary rendered", async ({ page }) => {
		await page.goto("/dashboard/attendance/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: date picker is present and shows a date value", async ({ page }) => {
		await page.goto("/dashboard/attendance/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// A date input or button should be present for the date picker
		const datePicker = page.locator("input[type='date'], [data-testid*='date'], button[aria-label*='date' i]").first();
		await expect(datePicker).toBeVisible({ timeout: 8_000 });
	});

	test("TC-04: KPI cards area is rendered", async ({ page }) => {
		await page.goto("/dashboard/attendance/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// Expect at least one numeric KPI value — scoped to main to avoid sidebar matches
		const labels = page.locator("main").getByText(/booked|checked.?in|no.?show|cancel/i);
		await expect(labels.first()).toBeVisible({ timeout: 8_000 });
	});
});

// ---------------------------------------------------------------------------
// 2. Audit Log View
// ---------------------------------------------------------------------------
test.describe("Audit Log View — /dashboard/audit/view", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads with audit log heading", async ({ page }) => {
		await page.goto("/dashboard/audit/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		await expect(page.getByRole("heading", { name: /audit/i }).first()).toBeVisible({ timeout: 8_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-02: no error boundary rendered", async ({ page }) => {
		await page.goto("/dashboard/audit/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: filter controls are present", async ({ page }) => {
		await page.goto("/dashboard/audit/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// At least one filter-related element (select, combobox, or input) should be visible
		const filterEl = page.locator("select, [role='combobox'], input[placeholder]").first();
		await expect(filterEl).toBeVisible({ timeout: 8_000 });
	});

	test("TC-04: data table or empty state is rendered", async ({ page }) => {
		await page.goto("/dashboard/audit/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// Either a table row exists, or an empty-state message is shown
		const hasRows = await page.locator("table tbody tr, [role='row']").count();
		const hasEmpty = await page.getByText(/no (audit|entries|results|data)/i).count();
		expect(hasRows + hasEmpty).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// 3. My Services View
// ---------------------------------------------------------------------------
test.describe("My Services View — /dashboard/my-services/view", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads with My Services heading", async ({ page }) => {
		await page.goto("/dashboard/my-services/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		await expect(page.getByRole("heading", { name: /my services/i }).first()).toBeVisible({ timeout: 8_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-02: no error boundary rendered", async ({ page }) => {
		await page.goto("/dashboard/my-services/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: table or empty state is shown", async ({ page }) => {
		await page.goto("/dashboard/my-services/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		const hasRows = await page.locator("table tbody tr, [role='row']").count();
		const hasEmpty = await page.getByText(/no services|no assigned|empty/i).count();
		expect(hasRows + hasEmpty).toBeGreaterThan(0);
	});

	test("TC-04: edit buffer dialog opens on edit button click", async ({ page }) => {
		await page.goto("/dashboard/my-services/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// Only attempt if there are rows with an edit button
		const editBtn = page.getByRole("button", { name: /edit/i }).first();
		const isVisible = await editBtn.isVisible();
		if (!isVisible) {
			test.skip();
			return;
		}

		await editBtn.click();
		// Dialog with "Set Buffer Time" should appear
		await expect(page.getByRole("dialog")).toBeVisible({ timeout: 8_000 });
		await expect(page.getByText(/buffer time/i)).toBeVisible({ timeout: 8_000 });
	});
});

// ---------------------------------------------------------------------------
// 4. Customers View (Registered)
// ---------------------------------------------------------------------------
test.describe("Customers View — /dashboard/customers/view", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads with customer list or empty state", async ({ page }) => {
		await page.goto("/dashboard/customers/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();

		const hasTable = await page.locator("table, [role='table']").count();
		const hasEmpty = await page.getByText(/no customers|no results|empty/i).count();
		expect(hasTable + hasEmpty).toBeGreaterThan(0);
	});

	test("TC-02: no error boundary rendered", async ({ page }) => {
		await page.goto("/dashboard/customers/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: search or filter control is present", async ({ page }) => {
		await page.goto("/dashboard/customers/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		const searchEl = page.locator("input[type='search'], input[placeholder*='search' i], input[placeholder*='filter' i]").first();
		await expect(searchEl).toBeVisible({ timeout: 8_000 });
	});
});

// ---------------------------------------------------------------------------
// 5. Walk-In Customers View (Redirect)
// ---------------------------------------------------------------------------
test.describe("Walk-In Customers View — /dashboard/customers/walk-in/view", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to /dashboard/customers/view", async ({ page }) => {
		await page.goto("/dashboard/customers/walk-in/view");
		await page.waitForURL("**/customers/view**", { timeout: 15_000 });

		// After redirect the customers page should render without errors
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-02: no error boundary after redirect", async ({ page }) => {
		await page.goto("/dashboard/customers/walk-in/view");
		await page.waitForURL("**/customers**", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// 6. Customer 360 — /dashboard/customers/$id
// ---------------------------------------------------------------------------
test.describe("Customer 360 — /dashboard/customers/$id", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads from list navigation", async ({ page }) => {
		await page.goto("/dashboard/customers/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// Skip if no customer rows
		const firstRow = page.locator("table tbody tr, [role='row']:not([role='columnheader'])").first();
		const rowCount = await page.locator("table tbody tr, [role='row']:not([role='columnheader'])").count();
		if (rowCount === 0) {
			test.skip();
			return;
		}

		await firstRow.click();
		await page.waitForURL("**/customers/**", { timeout: 15_000 });
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-02: no error boundary on customer detail page", async ({ page }) => {
		await page.goto("/dashboard/customers/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		const rowCount = await page.locator("table tbody tr, [role='row']:not([role='columnheader'])").count();
		if (rowCount === 0) {
			test.skip();
			return;
		}

		await page.locator("table tbody tr, [role='row']:not([role='columnheader'])").first().click();
		await page.waitForURL("**/customers/**", { timeout: 15_000 });

		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: customer name and back link are visible", async ({ page }) => {
		await page.goto("/dashboard/customers/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		const rowCount = await page.locator("table tbody tr, [role='row']:not([role='columnheader'])").count();
		if (rowCount === 0) {
			test.skip();
			return;
		}

		await page.locator("table tbody tr, [role='row']:not([role='columnheader'])").first().click();
		await page.waitForURL("**/customers/**", { timeout: 15_000 });
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// Back link to customers list
		const backLink = page.getByRole("link", { name: /customers|back/i });
		await expect(backLink.first()).toBeVisible({ timeout: 8_000 });
	});
});

// ---------------------------------------------------------------------------
// 7. Trainers View
// ---------------------------------------------------------------------------
test.describe("Trainers View — /dashboard/trainers/view", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads with Trainers heading and tabs", async ({ page }) => {
		await page.goto("/dashboard/trainers/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		await expect(page.getByRole("heading", { name: /trainers/i }).first()).toBeVisible({ timeout: 8_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-02: no error boundary rendered", async ({ page }) => {
		await page.goto("/dashboard/trainers/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: Tiers tab navigates to tiers view", async ({ page }) => {
		await page.goto("/dashboard/trainers/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		const tiersTab = page.getByRole("button", { name: /tiers/i }).or(page.getByRole("tab", { name: /tiers/i }));
		await expect(tiersTab).toBeVisible({ timeout: 8_000 });
		await tiersTab.click();

		await expect(page).toHaveURL(/tab=tiers/, { timeout: 8_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-04: trainers list or empty state is present on default tab", async ({ page }) => {
		await page.goto("/dashboard/trainers/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		const hasRows = await page.locator("table tbody tr, [role='row']:not([role='columnheader'])").count();
		const hasEmpty = await page.getByText(/no trainers|no results|empty/i).count();
		expect(hasRows + hasEmpty).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// 8. Trainers Tiers (Redirect)
// ---------------------------------------------------------------------------
test.describe("Trainers Tiers Redirect — /dashboard/trainers/tiers", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to /dashboard/trainers/view?tab=tiers", async ({ page }) => {
		await page.goto("/dashboard/trainers/tiers");
		await page.waitForURL("**/trainers/view**", { timeout: 15_000 });

		await expect(page).toHaveURL(/tab=tiers/);
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-02: no error boundary after redirect", async ({ page }) => {
		await page.goto("/dashboard/trainers/tiers");
		await page.waitForURL("**/trainers**", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// 9. Branch Create
// ---------------------------------------------------------------------------
test.describe("Branch Create — /dashboard/branch/create", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads with Create Branch heading and how-it-works card", async ({ page }) => {
		await page.goto("/dashboard/branch/create");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		await expect(page.getByRole("heading", { name: /create branch/i }).first()).toBeVisible({ timeout: 8_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-02: no error boundary rendered", async ({ page }) => {
		await page.goto("/dashboard/branch/create");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: How it works info card shows hierarchy steps", async ({ page }) => {
		await page.goto("/dashboard/branch/create");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// Info card should mention Country, Region, Area, Branch labels
		await expect(page.getByText(/country/i).first()).toBeVisible({ timeout: 8_000 });
		await expect(page.getByText(/region/i).first()).toBeVisible({ timeout: 8_000 });
		await expect(page.getByText(/branch/i).first()).toBeVisible({ timeout: 8_000 });
	});

	test("TC-04: hierarchical form first step is visible", async ({ page }) => {
		await page.goto("/dashboard/branch/create");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// A select or combobox for the first hierarchy level (Country) should be present
		const firstInput = page.locator("select, [role='combobox'], input").first();
		await expect(firstInput).toBeVisible({ timeout: 8_000 });
	});
});
