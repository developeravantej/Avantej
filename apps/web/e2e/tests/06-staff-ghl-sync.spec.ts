/**
 * Demo walkthrough 06: Staff invitation + accept-with-signup fires GHL user sync.
 *
 * UI flow (recorded in video):
 *   1. Login as franchisee admin
 *   2. Open Access Control → Invitations tab
 *   3. Click "Invite Member", fill form (role=staff, scope=seeded branch), submit
 *   4. Logout (clear cookies)
 *   5. Navigate to /accept-invitation?token=...&orgId=... using token from DB
 *   6. Fill atomic signup form (firstName/lastName/password)
 *   7. Submit → redirect to /dashboard
 *
 * Assertions (post-flow):
 *   - tenant.members has new staff row (role=staff, status=active)
 *   - tenant.ghl_user_links syncStatus='active', ghlUserId=/^mock_user_/
 *
 * Coverage scope: outbound staff sync **create** path. Update + delete are
 * exercised by orchestrator unit tests in
 *   packages/services/src/ghl-staff-sync.service.test.ts
 *
 * Pre-reqs: branch connected via connectBranchDirect; MOCK_GHL=1 (set in
 * playwright.config.ts webServer command).
 *
 * Produces: test-results/06-staff-ghl-sync-chromium/video.webm
 */

import { test, expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { invitations as invitationsTable } from "@avantej-core/db/schema/tenant/invitations";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { user as userTable } from "@avantej-core/db/schema/auth";
import {
	DEV_ADMIN_EMAIL,
	DEV_ADMIN_PASSWORD,
	seedE2EFixture,
	teardownE2EFixture,
	connectBranchDirect,
} from "../fixtures/seed";
import { loginAsAdmin } from "../fixtures/auth";
import { getControlPanelDb, getTenantDb } from "../fixtures/db";
import { waitForDb } from "../fixtures/wait";

// Force-record video (config defaults to retain-on-failure).
test.use({ video: "on" });

test("06 — staff invite+accept fires GHL user sync (create path)", async ({
	page,
	context,
}) => {
	const fx = await seedE2EFixture();
	const suffix = Date.now();
	const staffEmail = `e2e-staff-${suffix}@test.local`;
	const staffPassword = "TestPass123!";
	let createdStaffUserId: string | null = null;

	try {
		await connectBranchDirect(fx);

		// ── Step 1: Login admin ────────────────────────────────────────────────
		await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

		// ── Step 2: Open Invitations tab ───────────────────────────────────────
		await page.goto(
			"/dashboard/access-control/user-assignment?tab=invitations",
		);
		await page.waitForLoadState("networkidle");

		// ── Step 3: Open Invite dialog + fill form ────────────────────────────
		await page.getByRole("button", { name: "Invite Member" }).first().click();

		const dialog = page.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		await dialog.locator("#email").fill(staffEmail);

		// Role default = staff (per dialog defaultValues), no need to change.
		// Verify by reading the trigger label.
		await expect(dialog.locator("#role")).toContainText(/staff/i);

		// Hierarchy scope select — pick the seeded branch by name.
		await dialog.locator("#hierarchyScopeId").click();
		const branchOption = page
			.getByRole("option", { name: new RegExp(fx.branchName) })
			.first();
		await expect(branchOption).toBeVisible({ timeout: 5_000 });
		await branchOption.click();

		await dialog.getByRole("button", { name: /Send Invitation/i }).click();

		// Wait for dialog to close (mutation onSuccess closes it).
		await expect(dialog).toBeHidden({ timeout: 10_000 });

		// ── Step 4: Read invitation token from tenant DB ──────────────────────
		const t = await getTenantDb();
		const inv = await waitForDb(
			() =>
				t.query.invitations.findFirst({
					where: and(
						eq(invitationsTable.email, staffEmail),
						eq(invitationsTable.status, "pending"),
					),
				}),
			{ timeoutMs: 8_000 },
		);
		expect(inv.token).toBeTruthy();
		expect(inv.role).toBe("staff");

		// ── Step 5: Logout — clear cookies so accept-invitation shows signup ──
		await context.clearCookies();

		// ── Step 6: Accept-invitation page → atomic signup ────────────────────
		await page.goto(
			`/accept-invitation?token=${encodeURIComponent(inv.token)}&orgId=${encodeURIComponent(fx.organizationId)}`,
		);
		// Signup form renders only when (no session) AND (invitation valid).
		await expect(page.locator("#firstName")).toBeVisible({ timeout: 10_000 });

		await page.locator("#firstName").fill(`E2EStaff${suffix}`);
		await page.locator("#lastName").fill("Test");
		await page.locator("#password").fill(staffPassword);
		await page.locator("#confirmPassword").fill(staffPassword);

		await page
			.getByRole("button", { name: /Sign Up & Accept Invitation/i })
			.click();

		// acceptWithSignup mutation onSuccess → window.location.href = /dashboard
		await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

		// ── Step 7: DB assertion — member created ─────────────────────────────
		const cp = getControlPanelDb();
		const newUser = await waitForDb(
			() =>
				cp.query.user.findFirst({ where: eq(userTable.email, staffEmail) }),
			{ timeoutMs: 8_000 },
		);
		createdStaffUserId = newUser.id;

		const newMember = await waitForDb(
			() =>
				t.query.members.findFirst({ where: eq(members.userId, newUser.id) }),
			{ timeoutMs: 8_000 },
		);
		expect(newMember.role).toBe("staff");
		expect(newMember.status).toBe("active");
		expect(newMember.hierarchyScopeId).toBe(fx.branchNodeId);

		// ── Step 8: DB assertion — ghl_user_links row created ─────────────────
		const link = await waitForDb(
			() =>
				t.query.ghlUserLinks.findFirst({
					where: and(
						eq(ghlUserLinks.memberId, newMember.id),
						eq(ghlUserLinks.branchNodeId, fx.branchNodeId),
					),
				}),
			{ timeoutMs: 10_000 },
		);
		expect(link.syncStatus).toBe("active");
		expect(link.ghlUserId).toMatch(/^mock_user_/);
		expect(link.ghlLocationId).toBe("test_loc_1");
		expect(link.lastError).toBeNull();
	} finally {
		// Targeted cleanup for the staff user/member/link this spec created.
		const cp = getControlPanelDb();
		const t = await getTenantDb();
		try {
			if (createdStaffUserId) {
				const newMember = await t.query.members.findFirst({
					where: eq(members.userId, createdStaffUserId),
				});
				if (newMember) {
					await t
						.delete(ghlUserLinks)
						.where(eq(ghlUserLinks.memberId, newMember.id));
					await t.delete(members).where(eq(members.id, newMember.id));
				}
				await cp.delete(userTable).where(eq(userTable.id, createdStaffUserId));
			}
			// Invitation row (tenant table) — tied to staffEmail
			await t
				.delete(invitationsTable)
				.where(eq(invitationsTable.email, staffEmail));
		} catch (e) {
			console.warn("[teardown] staff cleanup:", e);
		}

		await teardownE2EFixture(fx);
	}
});
