/**
 * Demo walkthrough 04: Disconnect branch via admin UI
 *
 * Pre-req: branch connected (via connectBranchDirect).
 *
 * Login as admin → /go-highlevel-integration → click "Disconnect" on connected branch →
 * accept window.confirm → assert:
 *   - ghl_branch_links.isActive = false in control-panel DB
 *   - "Not connected" badge appears in the row
 *
 * Cleanup: teardownE2EFixture deletes the ghl_branch_links row regardless of isActive,
 * so the branch is fully cleaned for subsequent runs.
 *
 * Produces: test-results/04-disconnect-branch-chromium/video.webm
 */

import { test, expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import {
	DEV_ADMIN_EMAIL,
	DEV_ADMIN_PASSWORD,
	seedE2EFixture,
	teardownE2EFixture,
	connectBranchDirect,
} from "../fixtures/seed";
import { loginAsAdmin } from "../fixtures/auth";
import { getControlPanelDb } from "../fixtures/db";
import { waitForDb } from "../fixtures/wait";

test("04 — disconnect branch: Disconnect button marks isActive=false + Not connected badge", async ({
	page,
}) => {
	const fx = await seedE2EFixture();

	try {
		// Pre-condition: branch connected
		await connectBranchDirect(fx);

		// ── Step 1: Login as admin ─────────────────────────────────────────────
		await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

		// ── Step 2: Navigate to GHL integration page ──────────────────────────
		await page.goto("/go-highlevel-integration");
		await page.waitForLoadState("networkidle");

		// ── Step 3: Find the branch row — should show "Connected" badge ────────
		const branchRow = page.locator("tr", { hasText: fx.branchName });
		await expect(branchRow).toBeVisible({ timeout: 10_000 });
		await expect(branchRow.getByText(/^connected$/i)).toBeVisible({ timeout: 8_000 });

		// ── Step 4: Auto-accept confirm dialog, then click Disconnect ─────────
		page.on("dialog", (dialog) => dialog.accept());
		await branchRow
			.locator(`[data-testid="disconnect-btn-${fx.branchNodeId}"]`)
			.click();

		// ── Step 5: Assert "Not connected" badge appears ──────────────────────
		await expect(branchRow.getByText(/not connected/i)).toBeVisible({
			timeout: 15_000,
		});

		// ── Step 6: DB assertion — ghl_branch_links.isActive = false ──────────
		const cp = getControlPanelDb();
		const link = await waitForDb(
			() =>
				cp.query.ghlBranchLinks.findFirst({
					where: and(
						eq(ghlBranchLinks.organizationId, fx.organizationId),
						eq(ghlBranchLinks.tenantBranchId, fx.branchNodeId),
						eq(ghlBranchLinks.isActive, false),
					),
				}),
			{ timeoutMs: 8_000 },
		);
		expect(link.isActive).toBe(false);
	} finally {
		await teardownE2EFixture(fx);
	}
});
