/**
 * Demo walkthrough 07: Real GHL `/users/` sync (no MOCK_GHL).
 *
 * Same UI flow as spec 06, but the wrangler dev server runs WITHOUT MOCK_GHL=1,
 * so `syncStaffToGhl` makes live HTTPS calls to https://services.leadconnectorhq.com.
 *
 * Skipped unless E2E_REAL_GHL=1. Run via:
 *   bun run -F web e2e:test:real --grep "07"
 *
 * Pre-reqs:
 *   - apps/server/.env contains DATABASE_URL + ENCRYPTION_KEY
 *   - apps/server/.dev.vars contains GHL_AGENCY_ID
 *   - control_panel.ghl_branch_links has at least one active row with a real
 *     PIT API key + real ghl_location_id (we reuse the first match)
 *
 * Side effects:
 *   - Creates a real user in the GHL sub-account (visible in
 *     Settings → My Staff)
 *   - Real Resend email send (gmail+suffix alias to developer.avantej@gmail.com)
 *   - finally{} block deletes the GHL user via DELETE /users/:id
 *
 * Assertions:
 *   - tenant.ghl_user_links syncStatus='active'
 *   - ghlUserId is NOT `mock_user_*`
 *   - GHL GET /users/:id returns same email/firstName/lastName we submitted
 *
 * Produces: test-results/07-staff-ghl-sync-real-chromium/video.webm
 */

import { test, expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { invitations as invitationsTable } from "@avantej-core/db/schema/tenant/invitations";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { decrypt } from "@avantej-core/db";
import { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD } from "../fixtures/seed";
import { loginAsAdmin } from "../fixtures/auth";
import { getControlPanelDb, getTenantDb } from "../fixtures/db";
import { waitForDb } from "../fixtures/wait";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

interface GhlUserResponse {
	id: string;
	email?: string;
	firstName?: string;
	lastName?: string;
}

async function ghlGetUser(
	apiKey: string,
	userId: string,
): Promise<GhlUserResponse> {
	const res = await fetch(`${GHL_BASE_URL}/users/${userId}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: GHL_API_VERSION,
			Accept: "application/json",
		},
	});
	if (!res.ok) {
		throw new Error(`GHL GET /users/${userId} failed: ${res.status} ${await res.text()}`);
	}
	return (await res.json()) as GhlUserResponse;
}

async function ghlDeleteUser(apiKey: string, userId: string): Promise<void> {
	const res = await fetch(`${GHL_BASE_URL}/users/${userId}`, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: GHL_API_VERSION,
			Accept: "application/json",
		},
	});
	if (!res.ok) {
		throw new Error(
			`GHL DELETE /users/${userId} failed: ${res.status} ${await res.text()}`,
		);
	}
}

test.describe("real GHL", () => {
	test.skip(
		process.env.E2E_REAL_GHL !== "1",
		"Set E2E_REAL_GHL=1 to run live GHL spec",
	);

	test("07 — staff invite+accept against live GHL Users API", async ({
		page,
		context,
	}) => {
		const cp = getControlPanelDb();
		const t = await getTenantDb();

		// ── Lookup a connected branch with a real PIT key ─────────────────────
		const link = await cp.query.ghlBranchLinks.findFirst({
			where: eq(ghlBranchLinks.isActive, true),
		});
		if (!link) {
			throw new Error(
				"No active ghl_branch_links row. Connect a branch via the UI first.",
			);
		}
		const apiKey = decrypt(link.ghlApiKey);
		expect(apiKey.startsWith("pit-"), "expected real PIT API key").toBeTruthy();

		const branch = await t.query.hierarchyNodes.findFirst({
			where: eq(hierarchyNodes.id, link.tenantBranchId),
		});
		if (!branch) {
			throw new Error(
				`branch ${link.tenantBranchId} not found in tenant hierarchy`,
			);
		}

		const suffix = Date.now();
		const staffEmail = `developer.avantej+e2estaff${suffix}@gmail.com`;
		const staffPassword = "TestPass123!";

		let createdStaffUserId: string | null = null;
		let createdGhlUserId: string | null = null;

		try {
			// ── Step 1: Login admin ─────────────────────────────────────────────
			await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

			// ── Step 2: Open Invitations tab ───────────────────────────────────
			await page.goto(
				"/dashboard/access-control/user-assignment?tab=invitations",
			);
			await page.waitForLoadState("networkidle");

			// ── Step 3: Open dialog + fill form ────────────────────────────────
			await page.getByRole("button", { name: "Invite Member" }).first().click();
			const dialog = page.locator('[role="dialog"]');
			await expect(dialog).toBeVisible({ timeout: 5_000 });

			await dialog.locator("#email").fill(staffEmail);
			await expect(dialog.locator("#role")).toContainText(/staff/i);

			await dialog.locator("#hierarchyScopeId").click();
			const branchOption = page
				.getByRole("option", { name: new RegExp(branch.name) })
				.first();
			await expect(branchOption).toBeVisible({ timeout: 5_000 });
			await branchOption.click();

			await dialog.getByRole("button", { name: /Send Invitation/i }).click();
			await expect(dialog).toBeHidden({ timeout: 15_000 });

			// ── Step 4: Read invitation token ──────────────────────────────────
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
			expect(inv.role).toBe("staff");

			// ── Step 5: Logout ─────────────────────────────────────────────────
			await context.clearCookies();

			// ── Step 6: Atomic signup ──────────────────────────────────────────
			await page.goto(
				`/accept-invitation?token=${encodeURIComponent(inv.token)}&orgId=${encodeURIComponent(link.organizationId)}`,
			);
			await expect(page.locator("#firstName")).toBeVisible({ timeout: 15_000 });

			await page.locator("#firstName").fill(`E2EStaff${suffix}`);
			await page.locator("#lastName").fill("RealGhl");
			await page.locator("#password").fill(staffPassword);
			await page.locator("#confirmPassword").fill(staffPassword);

			await page
				.getByRole("button", { name: /Sign Up & Accept Invitation/i })
				.click();

			// Real GHL POST + DB writes — give it generous timeout
			await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

			// ── Step 7: DB asserts ─────────────────────────────────────────────
			const newUser = await waitForDb(
				() =>
					cp.query.user.findFirst({
						where: eq(userTable.email, staffEmail),
					}),
				{ timeoutMs: 10_000 },
			);
			createdStaffUserId = newUser.id;

			const newMember = await waitForDb(
				() =>
					t.query.members.findFirst({
						where: eq(members.userId, newUser.id),
					}),
				{ timeoutMs: 10_000 },
			);
			expect(newMember.role).toBe("staff");
			expect(newMember.status).toBe("active");

			const userLink = await waitForDb(
				() =>
					t.query.ghlUserLinks.findFirst({
						where: and(
							eq(ghlUserLinks.memberId, newMember.id),
							eq(ghlUserLinks.branchNodeId, link.tenantBranchId),
						),
					}),
				{ timeoutMs: 15_000 },
			);
			expect(userLink.syncStatus).toBe("active");
			expect(userLink.lastError).toBeNull();
			expect(userLink.ghlUserId).not.toMatch(/^mock_user_/);
			expect(userLink.ghlUserId.length).toBeGreaterThan(8);
			createdGhlUserId = userLink.ghlUserId;

			// ── Step 8: Round-trip to GHL ──────────────────────────────────────
			const ghlUser = await ghlGetUser(apiKey, userLink.ghlUserId);
			expect(ghlUser.id).toBe(userLink.ghlUserId);
			expect((ghlUser.email ?? "").toLowerCase()).toBe(staffEmail.toLowerCase());
			expect(ghlUser.firstName).toBe(`E2EStaff${suffix}`);
			expect(ghlUser.lastName).toBe("RealGhl");
		} finally {
			const skipCleanup = process.env.E2E_SKIP_GHL_CLEANUP === "1";
			if (skipCleanup) {
				console.log(
					`[teardown] E2E_SKIP_GHL_CLEANUP=1 — leaving GHL user ${createdGhlUserId} + DB rows in place for manual inspection`,
				);
				console.log(
					`           staffEmail=${staffEmail}  ghlUserId=${createdGhlUserId}  staffUserId=${createdStaffUserId}`,
				);
				return;
			}

			// ── GHL cleanup ─────────────────────────────────────────────────────
			if (createdGhlUserId) {
				try {
					await ghlDeleteUser(apiKey, createdGhlUserId);
				} catch (e) {
					console.warn("[teardown] GHL DELETE /users:", e);
				}
			}

			// ── DB cleanup ──────────────────────────────────────────────────────
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
					await cp
						.delete(userTable)
						.where(eq(userTable.id, createdStaffUserId));
				}
				await t
					.delete(invitationsTable)
					.where(eq(invitationsTable.email, staffEmail));
			} catch (e) {
				console.warn("[teardown] DB cleanup:", e);
			}
		}
	});
});
