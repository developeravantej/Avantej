/**
 * Demo walkthrough 02: Customer profile upsert via admin detail panel fires GHL sync
 *
 * Pre-req: branch is connected (via connectBranchDirect helper).
 *
 * Login as admin → /dashboard/customers/view → click pencil icon on seeded client →
 * CustomerDetailSheet opens → edit medicalNotes → Save Profile → assert:
 *   - customer_profiles.medicalNotes updated in tenant DB
 *   - ghl_contact_links row written with syncStatus='active' and ghlContactId matching
 *     /^mock_contact_/ (MOCK_GHL=1 stub)
 *
 * fireCustomerSync is awaited in upsertForCustomer (apps/server/src/routers/customer-profiles.ts
 * line 149), so the contact_links row is written before the API response returns.
 *
 * Produces: test-results/02-customer-upsert-sync-chromium/video.webm
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

const MEDICAL_NOTES_VALUE = "e2e walkthrough demo";

test("02 — customer upsert sync: admin profile edit triggers GHL contact creation", async ({
	page,
}) => {
	const fx = await seedE2EFixture();

	try {
		// Pre-condition: branch connected
		await connectBranchDirect(fx);

		// ── Step 1: Login as admin ─────────────────────────────────────────────
		await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

		// ── Step 2: Navigate directly to the customer detail via URL search param ─
		// The v1 registered customers page opens CustomerDetailSheet automatically
		// when ?customerId=<memberId> is supplied — avoids fragile table row search.
		await page.goto(
			`/dashboard/customers/view?customerId=${fx.clientMemberId}`,
		);
		await page.waitForLoadState("networkidle");

		// ── Step 3: CustomerDetailSheet opens automatically ───────────────────
		const sheet = page.locator('[role="dialog"]');
		await expect(sheet).toBeVisible({ timeout: 10_000 });

		// Clear existing value and type the test value
		const medicalInput = sheet.locator("#cd-medical");
		await medicalInput.clear();
		await medicalInput.fill(MEDICAL_NOTES_VALUE);

		// ── Step 5: Click Save Profile ────────────────────────────────────────
		await sheet.locator('[data-testid="save-profile-btn"]').click();

		// Wait for the success toast / button reverts to "Save Profile" (not "Saving...")
		await expect(sheet.locator('[data-testid="save-profile-btn"]')).toHaveText(
			"Save Profile",
			{ timeout: 10_000 },
		);

		// ── Step 6: DB assertion — customer_profiles.medicalNotes updated ─────
		const t = await getTenantDb();
		const profile = await waitForDb(
			() =>
				t.query.customerProfiles.findFirst({
					where: and(
						eq(customerProfiles.userId, fx.clientUserId),
						eq(customerProfiles.medicalNotes, MEDICAL_NOTES_VALUE),
					),
				}),
			{ timeoutMs: 8_000 },
		);
		expect(profile.medicalNotes).toBe(MEDICAL_NOTES_VALUE);

		// ── Step 7: DB assertion — ghl_contact_links row created ─────────────
		const contactLink = await waitForDb(
			() =>
				t.query.ghlContactLinks.findFirst({
					where: and(
						eq(ghlContactLinks.customerProfileId, profile.id),
						eq(ghlContactLinks.branchNodeId, fx.branchNodeId),
					),
				}),
			{ timeoutMs: 8_000 },
		);
		expect(contactLink.syncStatus).toBe("active");
		expect(contactLink.ghlContactId).toMatch(/^mock_contact_/);
		expect(contactLink.ghlLocationId).toBe("test_loc_1");
	} finally {
		await teardownE2EFixture(fx);
	}
});
