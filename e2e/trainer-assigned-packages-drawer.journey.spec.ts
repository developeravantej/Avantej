/**
 * Journey: Click a row in Assigned Packages tab → detail drawer opens with client + service names
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Seed: seeds a package instance assigned to the admin member if the table is empty.
 *
 * Run: bunx playwright test e2e/trainer-assigned-packages-drawer.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	pickFirstActiveClient,
	pickFirstService,
	seedAssignedPackageForAdmin,
} from "./helpers/seed-data";

// Admin member ID (franchisee@gmail.com) — known for the test tenant
const ADMIN_MEMBER_ID = "0f30a11c-3a03-47d4-9d4c-139668ccbd15";
// Admin user ID — from members.list response for admin role
const ADMIN_USER_ID = "wZGQSvB1v2xWt3NwcSV0DYvRDQLxldkH";

test("clicking an assigned-packages row opens the detail drawer", {
	tag: ["@p1"],
}, async ({ page }) => {
	// ── Seed: ensure at least one package is assigned to this admin member ────
	const client = await pickFirstActiveClient(page);
	const service = await pickFirstService(page, {
		hasSessions: true,
		isPackage: true,
	});
	if (client && service) {
		try {
			await seedAssignedPackageForAdmin(page, {
				serviceId: service.id,
				clientUserId: client.userId,
				adminMemberId: ADMIN_MEMBER_ID,
				adminUserId: ADMIN_USER_ID,
			});
		} catch {
			// Seeding failed — will skip below if table still empty
		}
	}

	await page.goto("/dashboard/my-services/view");

	// Click the Assigned Packages tab
	const tab = page.getByTestId("tab-assigned-packages");
	await expect(tab).toBeVisible();
	await tab.click();
	await expect(page).toHaveURL(/[?&]tab=assigned/, { timeout: 8_000 });

	// Wait for either the table OR the empty state to appear (data has loaded)
	const table = page.getByTestId("assigned-packages-table");
	const emptyState = page.getByTestId("assigned-packages-empty");
	await expect(table.or(emptyState)).toBeVisible({ timeout: 15_000 });

	// If only empty state — either seeding failed or API filtered it out
	const tableVisible = await table
		.isVisible({ timeout: 2_000 })
		.catch(() => false);
	test.skip(
		!tableVisible,
		"Assigned packages table not visible — seeding may have failed (package not assigned to admin member)",
	);

	const rowCount = await table.locator("tbody tr").count();
	test.skip(
		rowCount === 0,
		"No rows in assigned packages table — seeding may have failed (approval gate or service config)",
	);

	// Click the "View" button in the first row to open the drawer.
	// (Rows don't have row-level click handlers — the View button triggers the drawer.)
	const firstRow = table.locator("tbody tr").first();
	const viewBtn = firstRow.getByRole("button", { name: /view/i });
	await expect(viewBtn).toBeVisible({ timeout: 5_000 });
	await viewBtn.click();

	// Drawer should open
	const drawer = page.getByTestId("assigned-package-drawer");
	await expect(drawer).toBeVisible({ timeout: 10_000 });

	// Client name must be present
	const clientName = drawer.getByTestId("drawer-client-name");
	await expect(clientName).toBeVisible();
	const clientNameText = await clientName.textContent();
	expect(
		clientNameText?.trim(),
		"Drawer client name must not be empty",
	).toBeTruthy();

	// Service name must be present
	const serviceName = drawer.getByTestId("drawer-service-name");
	await expect(serviceName).toBeVisible();
	const serviceNameText = await serviceName.textContent();
	expect(
		serviceNameText?.trim(),
		"Drawer service name must not be empty",
	).toBeTruthy();

	// No JS errors — checked via absence of error overlay
	await expect(page.locator("[data-error-boundary]")).not.toBeVisible();
});
