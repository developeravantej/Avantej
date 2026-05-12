/**
 * Phase G smoke test (org-shared GHL sync) — Avantej-side UI only.
 *
 * Logs in as franchisee admin, lands on /go-highlevel-integration, asserts the
 * org-shared "Connected" card is rendered with the right location id +
 * provisioning data (Test Fitness Franchise was migrated to org-shared earlier
 * this session). Then navigates to /dashboard/branch/view to verify the
 * cascade cleanup landed (state-level dropdown, no area level).
 *
 * Always records video (test.use(video:on)) regardless of pass/fail so the
 * operator can review.
 *
 * Runs against MOCK_GHL=1 (config-set) — no real GHL HTTP calls.
 */

import { test, expect } from "@playwright/test";
import { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD } from "../fixtures/seed";
import { loginAsAdmin } from "../fixtures/auth";

test.use({ video: "on" });

test("09 — org-shared smoke: connect status + branch view cascade", async ({
	page,
}) => {
	// ── Step 1: Login as franchisee admin ──────────────────────────────────
	await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

	// ── Step 2: Navigate to GHL integration page ──────────────────────────
	await page.goto("/go-highlevel-integration");
	await page.waitForLoadState("networkidle");
	await page.screenshot({
		path: "test-results/09-org-shared-smoke-chromium/01-ghl-page.png",
		fullPage: true,
	});

	// ── Step 3: Assert org-shared section ───────────────────────────────────
	// Test Fitness Franchise has ghlSyncModel='org-shared' + ghlLocationId set,
	// so the page should render the connected card (not the connect form).
	const orgSharedCard = page.locator("text=Organization-Wide GHL Connection");
	await expect(orgSharedCard).toBeVisible({ timeout: 10_000 });

	const connectedBadge = page.locator("text=✓ Connected");
	await expect(connectedBadge).toBeVisible({ timeout: 5_000 });

	// Location id text should be visible
	const locationLine = page.locator("text=GHL location: G0izzPbelobw04MIntR1");
	await expect(locationLine).toBeVisible();

	// Disconnect button should exist (proves it's the connected variant)
	const disconnectBtn = page.locator(
		'[data-testid="org-shared-disconnect-btn"]',
	);
	await expect(disconnectBtn).toBeVisible();

	// ── Step 4: Navigate to branch view ────────────────────────────────────
	await page.goto("/dashboard/branch/view");
	await page.waitForLoadState("networkidle");
	await page.screenshot({
		path: "test-results/09-org-shared-smoke-chromium/02-branch-view.png",
		fullPage: true,
	});

	// Page should render without "area" labels (H1 + H1.5 cleanup).
	const areaLabel = page.locator("text=/select an area/i");
	await expect(areaLabel).toHaveCount(0);
});
