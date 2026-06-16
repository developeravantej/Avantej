/**
 * Journey: A non-admin (staff) user loads the Dashboard launchpad.
 * Suite: Dashboard · Tier: P1 · Actor: tenant-staff
 *
 * Proves the gating fix (commit 0d8e64e8): the launchpad's summary-strip
 * queries and card badges are permission-gated, so a staff user who may lack
 * reports:read / user_management:read / service_management:read lands on a
 * clean page with NO 403s — the defect this spec guards against.
 *
 * Runs under the `launchpad-staff` project (storageState = staff.json).
 */
import { test, expect } from "@playwright/test";

test("Launchpad loads for a non-admin staff user with no 403s", {
	tag: ["@p1"],
}, async ({ page }) => {
	const forbidden: string[] = [];
	page.on("response", (res) => {
		if (res.status() === 403 && res.url().includes("/rpc/")) {
			forbidden.push(new URL(res.url()).pathname);
		}
	});

	await page.goto("/dashboard");
	await expect(page).toHaveURL(/dashboard/);
	await page.waitForFunction(
		() => !!localStorage.getItem("current_organization_id"),
		{ timeout: 20_000, polling: 500 },
	);

	// The launchpad shell renders (gating degrades gracefully, no crash).
	await expect(page.getByText("Daily tasks", { exact: true })).toBeVisible({
		timeout: 15_000,
	});
	await expect(page.locator("body")).not.toContainText(
		/something went wrong|error boundary/i,
	);

	// Let the strip + badge queries settle, then assert none 403'd. This is the
	// regression guard: before the fix, the ungated strip queries 403'd here.
	await page.waitForTimeout(2500);
	expect(
		forbidden,
		`launchpad fired forbidden RPCs for staff: ${forbidden.join(", ")}`,
	).toHaveLength(0);
});
