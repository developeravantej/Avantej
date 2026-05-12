/**
 * Demo walkthrough 08: Full UI CRUD staff → GHL Users API (real, no mocks).
 *
 *   CREATE   → admin invites staff via UI → atomic signup → POST /users/
 *   UPDATE   → admin Edit Roles via UI dropdown (staff → trainer) → PUT /users/:id
 *   DEACTIVATE → admin Deactivate User via UI dropdown → ghl_user_links.syncStatus=inactive
 *
 * After each phase, verifies tenant.ghl_user_links + round-trips to live GHL
 * via `GET /users/:id` to confirm Avantej state matches GHL state.
 *
 * Skipped unless E2E_REAL_GHL=1. Run via:
 *   bun run -F web e2e:test:real --grep "08"
 *
 * Pre-reqs:
 *   - control_panel.ghl_branch_links has an active row with a real PIT key
 *   - apps/server/.dev.vars has GHL_AGENCY_ID
 *
 * Side effects:
 *   - Creates a real user in GHL (visible in Settings → My Staff)
 *   - finally{} idempotently DELETEs the GHL user + DB rows
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
): Promise<{ status: number; body: GhlUserResponse | null }> {
	const res = await fetch(`${GHL_BASE_URL}/users/${userId}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: GHL_API_VERSION,
			Accept: "application/json",
		},
	});
	if (!res.ok) return { status: res.status, body: null };
	return { status: res.status, body: (await res.json()) as GhlUserResponse };
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
	if (!res.ok && res.status !== 404) {
		throw new Error(
			`GHL DELETE /users/${userId} failed: ${res.status} ${await res.text()}`,
		);
	}
}

test.describe("real GHL CRUD", () => {
	test.skip(
		process.env.E2E_REAL_GHL !== "1",
		"Set E2E_REAL_GHL=1 to run live GHL spec",
	);

	test("08 — staff CRUD round-trip against live GHL Users API (full UI)", async ({
		page,
	}) => {
		const cp = getControlPanelDb();
		const t = await getTenantDb();

		const branchLink = await cp.query.ghlBranchLinks.findFirst({
			where: eq(ghlBranchLinks.isActive, true),
		});
		if (!branchLink) {
			throw new Error("No active ghl_branch_links row. Connect a branch first.");
		}
		const apiKey = decrypt(branchLink.ghlApiKey);
		expect(apiKey.startsWith("pit-"), "expected real PIT").toBeTruthy();

		const branch = await t.query.hierarchyNodes.findFirst({
			where: eq(hierarchyNodes.id, branchLink.tenantBranchId),
		});
		if (!branch) throw new Error("branch row missing in tenant hierarchy");

		const suffix = Date.now();
		const staffEmail = `developer.avantej+e2ecrud${suffix}@gmail.com`;
		const staffFirstName = `E2ECrud${suffix}`;
		const staffLastName = "RealGhl";
		const staffFullName = `${staffFirstName} ${staffLastName}`;
		const staffPassword = "TestPass123!";

		let createdStaffUserId: string | null = null;
		let createdGhlUserId: string | null = null;

		try {
			// ════════════════════════════════════════════════════════════════════
			// PHASE 1: CREATE — UI invite + UI atomic signup → GHL POST /users/
			// ════════════════════════════════════════════════════════════════════
			await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

			await page.goto(
				"/dashboard/access-control/user-assignment?tab=invitations",
			);
			await page.waitForLoadState("networkidle");

			await page.getByRole("button", { name: "Invite Member" }).first().click();
			const dialog = page.locator('[role="dialog"]');
			await expect(dialog).toBeVisible({ timeout: 5_000 });

			await dialog.locator("#email").fill(staffEmail);
			await expect(dialog.locator("#role")).toContainText(/staff/i);
			await dialog.locator("#hierarchyScopeId").click();
			await page
				.getByRole("option", { name: new RegExp(branch.name) })
				.first()
				.click();
			await dialog.getByRole("button", { name: /Send Invitation/i }).click();
			await expect(dialog).toBeHidden({ timeout: 15_000 });

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

			// Logout admin, accept invite as new staff (atomic signup)
			await page.context().clearCookies();
			await page.goto(
				`/accept-invitation?token=${encodeURIComponent(inv.token)}&orgId=${encodeURIComponent(branchLink.organizationId)}`,
			);
			await expect(page.locator("#firstName")).toBeVisible({ timeout: 15_000 });
			await page.locator("#firstName").fill(staffFirstName);
			await page.locator("#lastName").fill(staffLastName);
			await page.locator("#password").fill(staffPassword);
			await page.locator("#confirmPassword").fill(staffPassword);
			await page
				.getByRole("button", { name: /Sign Up & Accept Invitation/i })
				.click();
			await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

			const newUser = await waitForDb(
				() =>
					cp.query.user.findFirst({ where: eq(userTable.email, staffEmail) }),
				{ timeoutMs: 10_000 },
			);
			createdStaffUserId = newUser.id;
			const newMember = await waitForDb(
				() =>
					t.query.members.findFirst({ where: eq(members.userId, newUser.id) }),
				{ timeoutMs: 10_000 },
			);
			expect(newMember.role).toBe("staff");

			const linkAfterCreate = await waitForDb(
				() =>
					t.query.ghlUserLinks.findFirst({
						where: and(
							eq(ghlUserLinks.memberId, newMember.id),
							eq(ghlUserLinks.branchNodeId, branchLink.tenantBranchId),
						),
					}),
				{ timeoutMs: 15_000 },
			);
			expect(linkAfterCreate.syncStatus).toBe("active");
			expect(linkAfterCreate.ghlUserId).not.toMatch(/^mock_user_/);
			createdGhlUserId = linkAfterCreate.ghlUserId;

			const liveAfterCreate = await ghlGetUser(apiKey, createdGhlUserId);
			expect(liveAfterCreate.status).toBe(200);
			expect(liveAfterCreate.body?.email?.toLowerCase()).toBe(
				staffEmail.toLowerCase(),
			);
			expect(liveAfterCreate.body?.firstName).toBe(staffFirstName);

			// ════════════════════════════════════════════════════════════════════
			// PHASE 2: UPDATE — admin re-login + UI Edit Roles dropdown
			// ════════════════════════════════════════════════════════════════════
			await page.context().clearCookies();
			await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);
			await page.goto("/dashboard/access-control/user-assignment");
			await page.waitForLoadState("networkidle");

			// Locate the user's card by email text, then the MoreVertical button
			const card = page
				.locator(`text=${staffEmail}`)
				.locator("xpath=ancestor::div[contains(@data-slot,'card') or contains(@class,'card')][1]")
				.first();
			await expect(card).toBeVisible({ timeout: 15_000 });
			await card.getByRole("button").last().click();
			await page
				.getByRole("menuitem", { name: /Edit Roles/i })
				.first()
				.click();

			const roleDialog = page
				.locator('[role="dialog"]')
				.filter({ hasText: `Assign Role to ${staffFullName}` });
			await expect(roleDialog).toBeVisible({ timeout: 5_000 });
			// Click the Trainer card inside the dialog
			await roleDialog
				.locator("text=/^Trainer$/")
				.first()
				.click();
			await roleDialog
				.getByRole("button", { name: /Save Changes/i })
				.click();
			await expect(roleDialog).toBeHidden({ timeout: 15_000 });

			// DB asserts
			await waitForDb(
				async () => {
					const m = await t.query.members.findFirst({
						where: eq(members.id, newMember.id),
					});
					return m?.role === "trainer" ? m : undefined;
				},
				{ timeoutMs: 10_000 },
			);
			const linkAfterUpdate = await t.query.ghlUserLinks.findFirst({
				where: eq(ghlUserLinks.memberId, newMember.id),
			});
			expect(linkAfterUpdate?.syncStatus).toBe("active");
			expect(linkAfterUpdate?.ghlUserId).toBe(createdGhlUserId);

			const liveAfterUpdate = await ghlGetUser(apiKey, createdGhlUserId);
			expect(liveAfterUpdate.status).toBe(200);

			// ════════════════════════════════════════════════════════════════════
			// PHASE 3: DEACTIVATE — UI dropdown → Deactivate User
			// ════════════════════════════════════════════════════════════════════
			// Re-locate card (list re-rendered after invalidate)
			const cardAgain = page
				.locator(`text=${staffEmail}`)
				.locator("xpath=ancestor::div[contains(@data-slot,'card') or contains(@class,'card')][1]")
				.first();
			await expect(cardAgain).toBeVisible({ timeout: 10_000 });
			await cardAgain.getByRole("button").last().click();
			await page
				.getByRole("menuitem", { name: /Deactivate User/i })
				.first()
				.click();

			await waitForDb(
				async () => {
					const row = await t.query.ghlUserLinks.findFirst({
						where: eq(ghlUserLinks.memberId, newMember.id),
					});
					return row?.syncStatus === "inactive" ? row : undefined;
				},
				{ timeoutMs: 10_000 },
			);
			const memberAfterDeactivate = await t.query.members.findFirst({
				where: eq(members.id, newMember.id),
			});
			expect(memberAfterDeactivate?.status).toBe("inactive");

			// GHL user persists (deactivate doesn't fire DELETE — design choice).
			const liveAfterDeactivate = await ghlGetUser(apiKey, createdGhlUserId);
			expect(liveAfterDeactivate.status).toBe(200);
		} finally {
			const skipCleanup = process.env.E2E_SKIP_GHL_CLEANUP === "1";
			if (skipCleanup) {
				console.log(
					`[teardown] E2E_SKIP_GHL_CLEANUP=1 — leaving ghlUserId=${createdGhlUserId} staffEmail=${staffEmail} staffUserId=${createdStaffUserId} for inspection`,
				);
				return;
			}
			if (createdGhlUserId) {
				try {
					await ghlDeleteUser(apiKey, createdGhlUserId);
				} catch (e) {
					console.warn("[teardown] GHL DELETE:", e);
				}
			}
			try {
				if (createdStaffUserId) {
					const m = await t.query.members.findFirst({
						where: eq(members.userId, createdStaffUserId),
					});
					if (m) {
						await t
							.delete(ghlUserLinks)
							.where(eq(ghlUserLinks.memberId, m.id));
						await t.delete(members).where(eq(members.id, m.id));
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
