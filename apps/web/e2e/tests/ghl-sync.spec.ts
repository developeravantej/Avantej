/**
 * GHL Sync E2E — Three Checkpoints
 *
 * Checkpoint 1: Admin connects a branch to GHL via UI
 *   → asserts "Connected" badge visible + ghl_branch_links row written to control-panel DB
 *
 * Checkpoint 2: Admin calls customerProfiles.upsertForCustomer API for seeded client user
 *   → asserts customer_profiles row written to tenant DB
 *
 * Checkpoint 3: GHL contact sync fires after upsertForCustomer
 *   → asserts ghl_contact_links row written with mock_contact_* GHL contact ID
 *
 * Why API call not UI for checkpoints 2+3:
 *   - fireCustomerSync only fires for role='client' members.
 *   - Admin (franchisee@gmail.com) has role='admin' — sync skips for admin's own profile.
 *   - client role lacks user_management:read — cannot access /customers UI.
 *   - upsertForCustomer (admin procedure, requires customer_management:update) accepts
 *     targetUserId and fires sync for that client user. Admin has customer_management:update.
 *   - page.request.post() reuses the authenticated admin session cookies from checkpoint 1.
 *
 * Prerequisites:
 *   - MOCK_GHL=1 env var set (wired in apps/server/src/services/ghl/http-client.ts)
 *   - Dev server running (webServer config boots it with MOCK_GHL=1)
 *   - apps/server/.env has DATABASE_URL + TENANT_DATABASE_URL (loaded by global-setup.ts)
 *
 * Admin credentials: existing dev tenant creds (franchisee@gmail.com / password123)
 *   from CLAUDE.md — already have admin role + user_management:update in dev tenant.
 */

import { test, expect } from "@playwright/test";
import { eq, and } from "drizzle-orm";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { seedE2EFixture, teardownE2EFixture, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD } from "../fixtures/seed";
import { getControlPanelDb, getTenantDb } from "../fixtures/db";

// Poll a DB query until it returns a truthy result or times out
async function waitForDb<T>(
	fn: () => Promise<T | undefined | null>,
	opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
	const { timeoutMs = 5000, intervalMs = 300 } = opts;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const result = await fn();
		if (result) return result;
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	const last = await fn();
	if (last) return last;
	throw new Error("waitForDb timed out — row not found within expected window");
}

test.describe("GHL sync E2E", () => {
	test("connect branch + client profile upsert + GHL contact sync writes DB rows", async ({ page }) => {
		const fx = await seedE2EFixture();

		try {
			// ================================================================
			// Checkpoint 1: Admin connects branch to GHL
			// ================================================================

			// Login as dev admin
			await page.goto("/login");
			await page.fill('input[type="email"]', DEV_ADMIN_EMAIL);
			await page.fill('input[type="password"]', DEV_ADMIN_PASSWORD);
			await page.click('button[type="submit"]');
			await page.waitForURL(/\/(dashboard|customers|home|onboarding)/, {
				timeout: 15_000,
			});

			// Navigate to GHL integration page
			await page.goto("/go-highlevel-integration");
			await page.waitForLoadState("networkidle");

			// Find the table row for our test branch
			const branchRow = page.locator("tr", { hasText: fx.branchName });
			await expect(branchRow).toBeVisible({ timeout: 10_000 });

			// Click Connect button in that row
			await branchRow.getByRole("button", { name: /connect/i }).click();

			// Fill the GHL Location ID field in the dialog
			// The input uses id="ghlLocationId" (Label htmlFor="ghlLocationId")
			await page.fill("#ghlLocationId", "test_loc_1");

			// Fill the GHL API Key field
			await page.fill("#ghlApiKey", "pit-test-key-xxxxxxxxxx");

			// Click the Connect submit button in the dialog footer
			// There are two "Connect" buttons (table row + dialog footer), use last()
			await page
				.getByRole("button", { name: /^connect$/i })
				.last()
				.click();

			// Assert "Connected" badge appears in the row
			await expect(branchRow.getByText(/connected/i)).toBeVisible({
				timeout: 15_000,
			});

			// DB assertion: ghl_branch_links row written to control-panel
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

			// ================================================================
			// Checkpoint 2: Admin calls upsertForCustomer for the seeded client
			//
			// Using page.request.post() (reuses admin session cookies from login above).
			// Admin has customer_management:update → can call upsertForCustomer.
			// upsertForCustomer fires fireCustomerSync with targetUserId (client role) →
			// sync runs and writes ghl_contact_links (checkpoint 3).
			// ================================================================

			const upsertRes = await page.request.post(
				"http://localhost:3000/rpc/customerProfiles/upsertForCustomer",
				{
					data: {
						organizationId: fx.organizationId,
						targetUserId: fx.clientUserId,
						medicalNotes: "e2e-test-medical-notes",
					},
				},
			);
			expect(upsertRes.ok()).toBe(true);

			// DB assertion: customer_profiles row written for the client user
			const t = getTenantDb();
			const profile = await waitForDb(() =>
				t.query.customerProfiles.findFirst({
					where: eq(customerProfiles.userId, fx.clientUserId),
				}),
			);
			expect(profile.medicalNotes).toBe("e2e-test-medical-notes");

			// ================================================================
			// Checkpoint 3: ghl_contact_links row written by sync trigger
			//
			// fireCustomerSync looks up ghl_branch_links for (organizationId, branchNodeId)
			// from the client's member.hierarchyScopeId, calls GHL POST /contacts/ (mocked
			// by MOCK_GHL=1 → returns mock_contact_<random>), then upserts ghl_contact_links.
			// ================================================================

			const contactLink = await waitForDb(
				() =>
					t.query.ghlContactLinks.findFirst({
						where: and(
							eq(ghlContactLinks.customerProfileId, profile.id),
							eq(ghlContactLinks.branchNodeId, fx.branchNodeId),
						),
					}),
				{ timeoutMs: 8000 },
			);
			expect(contactLink.ghlLocationId).toBe("test_loc_1");
			expect(contactLink.syncStatus).toBe("active");
			expect(contactLink.ghlContactId).toMatch(/^mock_contact_/);
		} finally {
			await teardownE2EFixture(fx);
		}
	});
});
