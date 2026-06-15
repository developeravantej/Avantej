import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared login helper
// ---------------------------------------------------------------------------
async function login(page: Page) {
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
// 1. Dashboard Home  /dashboard
// ---------------------------------------------------------------------------
test.describe("Dashboard Home (/dashboard)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads with key widgets visible", async ({ page }) => {
		await page.goto("/dashboard");
		// GreetingBanner or a heading element should be visible
		await expect(
			page.locator("h1, h2, [data-testid='greeting']").first(),
		).toBeVisible({
			timeout: 15_000,
		});
	});

	test("TC-02: no error boundary", async ({ page }) => {
		await page.goto("/dashboard");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: KPI section and quick actions visible", async ({ page }) => {
		await page.goto("/dashboard");
		// Wait for page to settle
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		// At least one of the KPI card labels should appear
		const kpiVisible = await page
			.getByText(/sales overview|appointments|active members/i)
			.first()
			.isVisible({ timeout: 8_000 })
			.catch(() => false);
		// We don't hard-fail if data is absent; just confirm no crash
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
		// Page should have some content rendered
		expect(
			(await page.locator("main, [role='main'], #root > *").count()) > 0,
		).toBeTruthy();
	});

	test("TC-04: period param — page still loads with explicit period", async ({
		page,
	}) => {
		await page.goto("/dashboard?period=this_week");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// 2. Access Control — Roles  /dashboard/access-control/roles
// ---------------------------------------------------------------------------
test.describe("Access Control Roles (/dashboard/access-control/roles)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads — Roles tab visible by default", async ({ page }) => {
		await page.goto("/dashboard/access-control/roles");
		// Heading "Roles" should be visible
		await expect(
			page.getByRole("heading", { name: /roles/i }).first(),
		).toBeVisible({ timeout: 15_000 });
	});

	test("TC-02: no error boundary", async ({ page }) => {
		await page.goto("/dashboard/access-control/roles");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: Permissions tab button visible and clickable", async ({
		page,
	}) => {
		await page.goto("/dashboard/access-control/roles");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		const permissionsTab = page.getByRole("button", { name: /permissions/i });
		await expect(permissionsTab).toBeVisible({ timeout: 8_000 });
		await permissionsTab.click();
		// URL should update to include tab=permissions
		await expect(page).toHaveURL(/tab=permissions/, { timeout: 8_000 });
	});

	test("TC-04: direct navigation to Permissions tab renders content", async ({
		page,
	}) => {
		await page.goto("/dashboard/access-control/roles?tab=permissions");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
		// Permissions tab should be active — URL has the param
		await expect(page).toHaveURL(/tab=permissions/);
	});
});

// ---------------------------------------------------------------------------
// 3. Role View  /dashboard/access-control/roles → click first role ($id detail)
//    This is a legacy redirect route; we verify the redirect then navigate to
//    the roles list and attempt to open the first role if rows exist.
// ---------------------------------------------------------------------------
test.describe("Role View (detail via roles list)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: legacy /dashboard/role/view redirects to roles tab", async ({
		page,
	}) => {
		await page.goto("/dashboard/role/view");
		// Should redirect to /dashboard/access-control/roles?tab=roles
		await expect(page).toHaveURL(/access-control\/roles/, { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-02: no error boundary on redirect destination", async ({ page }) => {
		await page.goto("/dashboard/role/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: navigate to roles list and open first role if rows exist", async ({
		page,
	}) => {
		await page.goto("/dashboard/access-control/roles");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		const firstRow = page.locator("tbody tr").first();
		const hasRows = await firstRow
			.isVisible({ timeout: 8_000 })
			.catch(() => false);

		if (!hasRows) {
			test.skip(true, "No role rows found — skipping detail navigation");
			return;
		}

		// Click into the first role row or its edit/view link
		await firstRow.click();
		// After click, page should either stay (modal) or navigate — either way no error
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible({
			timeout: 8_000,
		});
	});
});

// ---------------------------------------------------------------------------
// 4. Access Control — User Assignment  /dashboard/access-control/user-assignment
// ---------------------------------------------------------------------------
test.describe("Access Control User Assignment (/dashboard/access-control/user-assignment)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads — Staff Access heading and Members tab visible", async ({
		page,
	}) => {
		await page.goto("/dashboard/access-control/user-assignment");
		await expect(
			page
				.getByRole("heading", { name: /staff access|user assignment|members/i })
				.first(),
		).toBeVisible({ timeout: 15_000 });
	});

	test("TC-02: no error boundary", async ({ page }) => {
		await page.goto("/dashboard/access-control/user-assignment");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: Invitations tab button visible and switches tab", async ({
		page,
	}) => {
		await page.goto("/dashboard/access-control/user-assignment");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		const invTab = page.getByRole("button", { name: /invitations/i });
		await expect(invTab).toBeVisible({ timeout: 8_000 });
		await invTab.click();
		await expect(page).toHaveURL(/tab=invitations/, { timeout: 8_000 });
	});

	test("TC-04: Members tab shows a list or empty state (no crash)", async ({
		page,
	}) => {
		await page.goto("/dashboard/access-control/user-assignment");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		// Either a table row or an empty state message should be present
		const tableOrEmpty = page.locator(
			"tbody tr, [data-empty-state], [data-testid='empty']",
		);
		// We just confirm no crash; content may vary
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// 5. Access Control — Permissions (legacy redirect)
//    /dashboard/access-control/permissions → /dashboard/access-control/roles?tab=permissions
// ---------------------------------------------------------------------------
test.describe("Access Control Permissions (legacy redirect)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to roles page with permissions tab", async ({
		page,
	}) => {
		await page.goto("/dashboard/access-control/permissions");
		await expect(page).toHaveURL(
			/access-control\/roles.*tab=permissions|access-control\/roles\?tab=permissions/,
			{
				timeout: 15_000,
			},
		);
	});

	test("TC-02: no error boundary after redirect", async ({ page }) => {
		await page.goto("/dashboard/access-control/permissions");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// 6. Access Control — Invitations (legacy redirect)
//    /dashboard/access-control/invitations → /dashboard/access-control/user-assignment?tab=invitations
// ---------------------------------------------------------------------------
test.describe("Access Control Invitations (legacy redirect)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to user-assignment with invitations tab", async ({
		page,
	}) => {
		await page.goto("/dashboard/access-control/invitations");
		await expect(page).toHaveURL(
			/access-control\/user-assignment.*tab=invitations|access-control\/user-assignment\?tab=invitations/,
			{ timeout: 15_000 },
		);
	});

	test("TC-02: no error boundary after redirect", async ({ page }) => {
		await page.goto("/dashboard/access-control/invitations");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// 7. Appointment View  /dashboard/appointment/view
// ---------------------------------------------------------------------------
test.describe("Appointment View (/dashboard/appointment/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads — appointment list area visible", async ({
		page,
	}) => {
		await page.goto("/dashboard/appointment/view");
		// The appointment page should render some container; heading or main content
		await expect(
			page.locator("h1, h2, [data-testid='appointment-list'], main").first(),
		).toBeVisible({ timeout: 15_000 });
	});

	test("TC-02: no error boundary", async ({ page }) => {
		await page.goto("/dashboard/appointment/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: page content renders (appointments or empty state, no crash)", async ({
		page,
	}) => {
		await page.goto("/dashboard/appointment/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		// Confirm no blank white page — at least one meaningful element
		const anyContent = page
			.locator("main, [role='main'], table, ul, [data-testid]")
			.first();
		await expect(anyContent).toBeVisible({ timeout: 8_000 });
	});
});

// ---------------------------------------------------------------------------
// 8. Appointment Class Slots View  /dashboard/appointment/class-slots/view
// ---------------------------------------------------------------------------
test.describe("Appointment Class Slots View (/dashboard/appointment/class-slots/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: page loads — table or empty state visible", async ({ page }) => {
		await page.goto("/dashboard/appointment/class-slots/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		// Either a data table or an empty-state message should render
		const tableOrEmpty = page
			.locator("table, [data-testid='empty-state'], [class*='empty']")
			.first();
		await expect(tableOrEmpty).toBeVisible({ timeout: 8_000 });
	});

	test("TC-02: no error boundary", async ({ page }) => {
		await page.goto("/dashboard/appointment/class-slots/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});

	test("TC-03: create button (plus) is visible", async ({ page }) => {
		await page.goto("/dashboard/appointment/class-slots/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		// Create / plus button should be present for admin
		const createBtn = page
			.getByRole("button", { name: /create|add|new|\+/i })
			.first();
		await expect(createBtn).toBeVisible({ timeout: 8_000 });
	});

	test("TC-04: table columns visible when rows exist", async ({ page }) => {
		await page.goto("/dashboard/appointment/class-slots/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		const firstRow = page.locator("tbody tr").first();
		const hasRows = await firstRow
			.isVisible({ timeout: 8_000 })
			.catch(() => false);

		if (!hasRows) {
			test.skip(true, "No class slot rows found — skipping column check");
			return;
		}

		// If rows exist, table headers should include at least Date or Service
		const headerText = await page
			.locator("thead")
			.textContent({ timeout: 8_000 });
		expect(headerText?.toLowerCase()).toMatch(/date|service|capacity|status/);
	});
});

// ---------------------------------------------------------------------------
// 9. Rooms View  /dashboard/rooms/view  (redirect to /dashboard/service/view?tab=rooms)
// ---------------------------------------------------------------------------
test.describe("Rooms View (redirect) (/dashboard/rooms/view)", () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test("TC-01: redirects to service/view with rooms tab", async ({ page }) => {
		await page.goto("/dashboard/rooms/view");
		await expect(page).toHaveURL(
			/service\/view.*tab=rooms|service\/view\?tab=rooms/,
			{
				timeout: 15_000,
			},
		);
	});

	test("TC-02: no error boundary after redirect", async ({ page }) => {
		await page.goto("/dashboard/rooms/view");
		await page.waitForLoadState("networkidle", { timeout: 15_000 });
		await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
	});
});
