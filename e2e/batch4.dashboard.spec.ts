import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
	await page.goto("/login");
	await page.getByLabel("Email").fill("franchisee@gmail.com");
	await page.locator("#password").fill("password123");
	await page
		.getByRole("button", { name: /sign in|login/i })
		.first()
		.click();
	await page.waitForURL("**/dashboard**", { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// 1. Payment View
// ---------------------------------------------------------------------------
test.describe("Payment View (/dashboard/payment/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads with Payments heading", async ({ page }) => {
		await page.goto("/dashboard/payment/view");
		await expect(page.getByRole("heading", { name: /payments/i })).toBeVisible({
			timeout: 15_000,
		});
	});

	test("TC-02: page does not crash", async ({ page }) => {
		await page.goto("/dashboard/payment/view");
		await expect(page.getByRole("heading", { name: /payments/i })).toBeVisible({
			timeout: 15_000,
		});
		// No unhandled error overlay or blank white screen
		await expect(page.locator("body")).not.toBeEmpty();
	});

	test("TC-03: table container is rendered", async ({ page }) => {
		await page.goto("/dashboard/payment/view");
		await expect(page.getByRole("heading", { name: /payments/i })).toBeVisible({
			timeout: 15_000,
		});
		// Table or loading/empty state should be present in the DOM
		const tableOrState = page
			.locator(
				"table, [data-testid='loading'], [data-testid='empty-state'], [role='table']",
			)
			.first();
		await expect(tableOrState).toBeVisible({ timeout: 8_000 });
	});

	test("TC-06: description text is present", async ({ page }) => {
		await page.goto("/dashboard/payment/view");
		await expect(page.getByRole("heading", { name: /payments/i })).toBeVisible({
			timeout: 15_000,
		});
		await expect(
			page.getByText(/view and manage invoice payments/i),
		).toBeVisible({ timeout: 8_000 });
	});
});

// ---------------------------------------------------------------------------
// 2. Promotions View — redirect stub
// ---------------------------------------------------------------------------
test.describe("Promotions View — redirect (/dashboard/promotions/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to /dashboard/service/view?tab=promotions and renders content", async ({
		page,
	}) => {
		await page.goto("/dashboard/promotions/view");
		await page.waitForURL("**/dashboard/service/view**", { timeout: 15_000 });
		expect(page.url()).toContain("tab=promotions");
		await expect(page.locator("body")).not.toBeEmpty();
	});
});

// ---------------------------------------------------------------------------
// 3. Package Instances View — redirect stub
// ---------------------------------------------------------------------------
test.describe("Package Instances View — redirect (/dashboard/packages/instances/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to /dashboard/packages/view?tab=session-packs and renders content", async ({
		page,
	}) => {
		await page.goto("/dashboard/packages/instances/view");
		await page.waitForURL("**/dashboard/packages/view**", { timeout: 15_000 });
		expect(page.url()).toContain("tab=session-packs");
		await expect(page.locator("body")).not.toBeEmpty();
	});
});

// ---------------------------------------------------------------------------
// 4. Package Installments View — redirect stub
// ---------------------------------------------------------------------------
test.describe("Package Installments View — redirect (/dashboard/packages/installments/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to /dashboard/packages/view?tab=installments and renders content", async ({
		page,
	}) => {
		await page.goto("/dashboard/packages/installments/view");
		await page.waitForURL("**/dashboard/packages/view**", { timeout: 15_000 });
		expect(page.url()).toContain("tab=installments");
		await expect(page.locator("body")).not.toBeEmpty();
	});
});

// ---------------------------------------------------------------------------
// 5. Brands View — redirect stub
// ---------------------------------------------------------------------------
test.describe("Brands View — redirect (/dashboard/brands/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to /dashboard/inventory-options?tab=brands and renders content", async ({
		page,
	}) => {
		await page.goto("/dashboard/brands/view");
		await page.waitForURL("**/dashboard/inventory-options**", {
			timeout: 15_000,
		});
		expect(page.url()).toContain("tab=brands");
		await expect(page.locator("body")).not.toBeEmpty();
	});
});

// ---------------------------------------------------------------------------
// 6. Categories View — redirect stub
// ---------------------------------------------------------------------------
test.describe("Categories View — redirect (/dashboard/categories/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to /dashboard/inventory-options?tab=categories and renders content", async ({
		page,
	}) => {
		await page.goto("/dashboard/categories/view");
		await page.waitForURL("**/dashboard/inventory-options**", {
			timeout: 15_000,
		});
		expect(page.url()).toContain("tab=categories");
		await expect(page.locator("body")).not.toBeEmpty();
	});
});

// ---------------------------------------------------------------------------
// 7. Suppliers View — redirect stub
// ---------------------------------------------------------------------------
test.describe("Suppliers View — redirect (/dashboard/suppliers/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to /dashboard/inventory-options?tab=suppliers and renders content", async ({
		page,
	}) => {
		await page.goto("/dashboard/suppliers/view");
		await page.waitForURL("**/dashboard/inventory-options**", {
			timeout: 15_000,
		});
		expect(page.url()).toContain("tab=suppliers");
		await expect(page.locator("body")).not.toBeEmpty();
	});
});

// ---------------------------------------------------------------------------
// 8. Transfer Orders View — redirect stub
// ---------------------------------------------------------------------------
test.describe("Transfer Orders View — redirect (/dashboard/transfer-orders/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to /dashboard/stock-requests/view?tab=transfers and renders content", async ({
		page,
	}) => {
		await page.goto("/dashboard/transfer-orders/view");
		await page.waitForURL("**/dashboard/stock-requests/view**", {
			timeout: 15_000,
		});
		expect(page.url()).toContain("tab=transfers");
		await expect(page.locator("body")).not.toBeEmpty();
	});
});
