/**
 * Demo walkthrough 03: Customer soft-delete via danger-zone button in CustomerDetailSheet
 *
 * Pre-req: branch connected + customer_profiles + ghl_contact_links rows present
 * (seeded directly via DB — avoids depending on test 02's UI flow).
 *
 * Login as admin → /dashboard/customers/view → click pencil icon on seeded client →
 * CustomerDetailSheet opens → click "Delete customer" (danger zone footer) →
 * accept window.confirm dialog → assert:
 *   - customer_profiles.isDeleted = true
 *   - customer_profiles.deletedSource = 'avantej'
 *   - ghl_contact_links.syncStatus = 'deleted' for that contact link
 *
 * softDelete (apps/server/src/routers/customer-profiles.ts) fires GHL DELETE and
 * sets is_deleted=true / deleted_source='avantej' in one transaction.
 *
 * Produces: test-results/03-customer-soft-delete-chromium/video.webm
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

test("03 — customer soft-delete: danger-zone button marks deleted + GHL contact deleted", async ({
	page,
}) => {
	const fx = await seedE2EFixture();

	try {
		// Pre-condition: branch connected
		await connectBranchDirect(fx);

		// Pre-condition: insert customer_profiles + ghl_contact_links for seeded client
		const t = await getTenantDb();
		const [profile] = await t
			.insert(customerProfiles)
			.values({ userId: fx.clientUserId, medicalNotes: "pre-delete-seed" })
			.returning();
		if (!profile) throw new Error("Failed to insert customer_profiles seed row");

		const [contactLink] = await t
			.insert(ghlContactLinks)
			.values({
				customerProfileId: profile.id,
				userId: fx.clientUserId,
				branchNodeId: fx.branchNodeId,
				ghlLocationId: "test_loc_1",
				ghlContactId: "mock_contact_pre_delete_seed",
				syncStatus: "active",
			})
			.returning();
		if (!contactLink) throw new Error("Failed to insert ghl_contact_links seed row");

		// ── Step 1: Login as admin ─────────────────────────────────────────────
		await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

		// ── Step 2: Navigate directly to customer detail via URL search param ────
		// Passing ?customerId=<memberId> opens CustomerDetailSheet automatically.
		await page.goto(
			`/dashboard/customers/view?customerId=${fx.clientMemberId}`,
		);
		await page.waitForLoadState("networkidle");

		// ── Step 3: CustomerDetailSheet opens automatically ───────────────────
		const sheet = page.locator('[role="dialog"]');
		await expect(sheet).toBeVisible({ timeout: 10_000 });

		// ── Step 5: Auto-accept the window.confirm dialog, then click Delete ──
		page.on("dialog", (dialog) => dialog.accept());
		await sheet.locator('[data-testid="delete-customer-btn"]').click();

		// Sheet should close after successful delete
		await expect(sheet).not.toBeVisible({ timeout: 15_000 });

		// ── Step 6: DB assertion — customer_profiles.isDeleted = true ─────────
		const deletedProfile = await waitForDb(
			() =>
				t.query.customerProfiles.findFirst({
					where: and(
						eq(customerProfiles.id, profile.id),
						eq(customerProfiles.isDeleted, true),
					),
				}),
			{ timeoutMs: 8_000 },
		);
		expect(deletedProfile.isDeleted).toBe(true);
		expect(deletedProfile.deletedSource).toBe("avantej");

		// ── Step 7: DB assertion — ghl_contact_links.syncStatus = 'deleted' ───
		const deletedLink = await waitForDb(
			() =>
				t.query.ghlContactLinks.findFirst({
					where: and(
						eq(ghlContactLinks.id, contactLink.id),
						eq(ghlContactLinks.syncStatus, "deleted"),
					),
				}),
			{ timeoutMs: 8_000 },
		);
		expect(deletedLink.syncStatus).toBe("deleted");
	} finally {
		await teardownE2EFixture(fx);
	}
});
