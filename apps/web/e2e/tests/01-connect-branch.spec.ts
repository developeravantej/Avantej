/**
 * Demo walkthrough 01: Connect branch via admin UI
 *
 * Login as admin → /go-highlevel-integration → click "Connect" on a not-connected
 * branch → fill Location ID + API key → submit → assert "Connected" badge appears
 * + ghl_branch_links row written to control-panel DB.
 *
 * Produces: test-results/01-connect-branch-chromium/video.webm
 */

import { test, expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import {
	DEV_ADMIN_EMAIL,
	DEV_ADMIN_PASSWORD,
	seedE2EFixture,
	teardownE2EFixture,
} from "../fixtures/seed";
import { loginAsAdmin } from "../fixtures/auth";
import { getControlPanelDb } from "../fixtures/db";
import { waitForDb } from "../fixtures/wait";

test("01 — connect branch: UI connect modal writes Connected badge + ghl_branch_links row", async ({
	page,
}) => {
	const fx = await seedE2EFixture();

	try {
		// ── Step 1: Login as admin ─────────────────────────────────────────────
		await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

		// ── Step 2: Navigate to GHL integration page ──────────────────────────
		await page.goto("/go-highlevel-integration");
		await page.waitForLoadState("networkidle");

		// ── Step 3: Find the seeded branch row and click Connect ──────────────
		const branchRow = page.locator("tr", { hasText: fx.branchName });
		await expect(branchRow).toBeVisible({ timeout: 10_000 });

		// Use data-testid for reliable targeting (added to go-highlevel-integration.tsx)
		await branchRow.locator(`[data-testid="connect-btn-${fx.branchNodeId}"]`).click();

		// ── Step 4: Fill the connect dialog ───────────────────────────────────
		await page.fill("#ghlLocationId", "test_loc_1");
		await page.fill("#ghlApiKey", "pit-test-key-xxxxxxxxxx");

		// Click the "Connect" submit button in the dialog footer (last match)
		await page
			.getByRole("button", { name: /^connect$/i })
			.last()
			.click();

		// ── Step 5: Assert "Connected" badge appears ──────────────────────────
		await expect(branchRow.getByText(/connected/i)).toBeVisible({
			timeout: 15_000,
		});

		// ── Step 6: DB assertion — ghl_branch_links row written ───────────────
		const cp = getControlPanelDb();
		const link = await waitForDb(() =>
			cp.query.ghlBranchLinks.findFirst({
				where: and(
					eq(ghlBranchLinks.organizationId, fx.organizationId),
					eq(ghlBranchLinks.tenantBranchId, fx.branchNodeId),
				),
			}),
		);
		expect(link.ghlLocationId).toBe("test_loc_1");
		expect(link.isActive).toBe(true);
	} finally {
		await teardownE2EFixture(fx);
	}
});
