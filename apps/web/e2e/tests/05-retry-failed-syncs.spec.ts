/**
 * Demo walkthrough 05: Retry failed syncs via admin UI
 *
 * Pre-req: branch connected + an errored ghl_contact_links row seeded directly.
 *
 * Setup: insert a ghl_contact_links row with syncStatus='error', lastError='mock failure'.
 * The row uses the seeded client's customerProfileId + userId + branchNodeId so the
 * retryFailedSyncs handler can resolve the profile, user, and member records needed
 * to call syncCustomerToGhl (which succeeds via MOCK_GHL=1).
 *
 * Login as admin → /go-highlevel-integration → assert "1 failed" badge visible →
 * click "Retry" button → wait for toast → assert:
 *   - ghl_contact_links.syncStatus = 'active' in tenant DB (recovered)
 *   - UI: error badge is gone (branch row shows no failed count)
 *
 * retryFailedSyncs (apps/server/src/routers/ghl.ts line 203) re-runs syncCustomerToGhl
 * for each error row; with MOCK_GHL=1 it always succeeds → syncStatus flips to 'active'.
 *
 * Produces: test-results/05-retry-failed-syncs-chromium/video.webm
 */

import { test, expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import {
	DEV_ADMIN_EMAIL,
	DEV_ADMIN_PASSWORD,
	seedE2EFixture,
	teardownE2EFixture,
	connectBranchDirect,
} from "../fixtures/seed";
import { loginAsAdmin } from "../fixtures/auth";
import { getTenantDb } from "../fixtures/db";
import { waitForDb } from "../fixtures/wait";

test("05 — retry failed syncs: seeded error row recovered via Retry button", async ({
	page,
}) => {
	const fx = await seedE2EFixture();

	try {
		// Pre-condition: branch connected
		await connectBranchDirect(fx);

		// Pre-condition: seed a customer_profiles row so retryFailedSyncs can
		// resolve the profile when it re-fires syncCustomerToGhl.
		const t = await getTenantDb();
		const [profile] = await t
			.insert(customerProfiles)
			.values({ userId: fx.clientUserId, medicalNotes: "retry-seed" })
			.returning();
		if (!profile) throw new Error("Failed to insert customer_profiles seed row");

		// Seed a ghl_contact_links error row — this is the row the handler will retry.
		const [errorLink] = await t
			.insert(ghlContactLinks)
			.values({
				customerProfileId: profile.id,
				userId: fx.clientUserId,
				branchNodeId: fx.branchNodeId,
				ghlLocationId: "test_loc_1",
				ghlContactId: "mock_contact_error_seed",
				syncStatus: "error",
				lastError: "mock failure",
			})
			.returning();
		if (!errorLink) throw new Error("Failed to insert error ghl_contact_links row");

		// ── Step 1: Login as admin ─────────────────────────────────────────────
		await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

		// ── Step 2: Navigate to GHL integration page ──────────────────────────
		await page.goto("/go-highlevel-integration");
		await page.waitForLoadState("networkidle");

		// ── Step 3: Assert "1 failed" badge is visible for the branch row ─────
		const branchRow = page.locator("tr", { hasText: fx.branchName });
		await expect(branchRow).toBeVisible({ timeout: 10_000 });
		await expect(branchRow.getByText(/1 failed/i)).toBeVisible({
			timeout: 10_000,
		});

		// ── Step 4: Click the Retry button ────────────────────────────────────
		await branchRow
			.locator(`[data-testid="retry-btn-${fx.branchNodeId}"]`)
			.click();

		// ── Step 5: Wait for retry to complete (button re-enables) ───────────
		// The button reads "Retrying…" during the mutation; wait for it to revert.
		await expect(
			branchRow.locator(`[data-testid="retry-btn-${fx.branchNodeId}"]`),
		).not.toBeVisible({ timeout: 15_000 });
		// The retry button disappears once errorCount drops to 0 (no more errors)

		// ── Step 6: DB assertion — ghl_contact_links.syncStatus = 'active' ────
		const recovered = await waitForDb(
			() =>
				t.query.ghlContactLinks.findFirst({
					where: and(
						eq(ghlContactLinks.id, errorLink.id),
						eq(ghlContactLinks.syncStatus, "active"),
					),
				}),
			{ timeoutMs: 10_000 },
		);
		expect(recovered.syncStatus).toBe("active");

		// ── Step 7: UI assertion — error badge gone ───────────────────────────
		// After retry recovers the row, the badge should no longer show "failed".
		// Reload to get fresh listBranchLinks response.
		await page.reload();
		await page.waitForLoadState("networkidle");
		const refreshedRow = page.locator("tr", { hasText: fx.branchName });
		await expect(refreshedRow).toBeVisible({ timeout: 10_000 });
		await expect(refreshedRow.getByText(/failed/i)).not.toBeVisible({
			timeout: 5_000,
		});
	} finally {
		await teardownE2EFixture(fx);
	}
});
