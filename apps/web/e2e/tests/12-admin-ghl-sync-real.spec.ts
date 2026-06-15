/**
 * Demo walkthrough 12: Admin invite — locks in the CURRENT "skip" behavior.
 *
 * WHY this asserts a skip (not a bug):
 *   1. UI restriction — `apps/web/src/components/invitations/create-invitation-dialog.tsx:100-106`
 *      filters `availableScopes` so that when `role === "admin"` the ONLY selectable
 *      scope is `{ type: "organization", depth: 0 }` (the org-root node). Admins
 *      cannot be scoped to a branch from the UI.
 *   2. Sync gate — `packages/services/src/ghl-staff-sync.service.ts:127-129`
 *      short-circuits `dispatchStaffSync` with `{ status: "skipped", reason: "non-branch-scope" }`
 *      whenever the member's hierarchy scope is not a `branch`. Since admins land
 *      on the org-root node, `syncStaffToGhl` is never invoked, no row is written
 *      to `tenant.ghl_user_links`, and no user is created in GHL.
 *
 * If a future change wires admin-level access to GHL (e.g. fan-out across all
 * branches in the org), this spec will fail loudly — which is the point. Until
 * then, this test pins the existing behavior so we notice if it drifts.
 *
 * Skipped unless E2E_REAL_GHL=1. Run via:
 *   bun run -F web e2e:test:real --grep "12"
 *
 * Pre-reqs:
 *   - apps/server/.env contains DATABASE_URL + ENCRYPTION_KEY
 *   - control_panel.ghl_branch_links has at least one active row with a real
 *     PIT API key + real ghl_location_id (we reuse the first match)
 *
 * Side effects:
 *   - Creates an Avantej admin member (control panel user + tenant member rows).
 *   - Real Resend email send (gmail+suffix alias to developer.avantej@gmail.com).
 *   - NO GHL user is created — that's the assertion.
 *   - finally{} block deletes the Avantej user/member rows. Nothing to clean
 *     up on the GHL side.
 *
 * Assertions:
 *   - cp.user has the new email
 *   - tenant.members.role = "admin", hierarchy scope is type=organization,depth=0
 *   - tenant.ghl_user_links has NO row for this member
 *   - GHL GET /users/?locationId=... does NOT include the new email
 *
 * Produces: test-results/12-admin-ghl-sync-real-chromium/video.webm
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

interface GhlUsersListResponse {
	users?: GhlUserResponse[];
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
		throw new Error(
			`GHL GET /users/${userId} failed: ${res.status} ${await res.text()}`,
		);
	}
	return (await res.json()) as GhlUserResponse;
}

async function ghlListUsers(
	apiKey: string,
	locationId: string,
): Promise<GhlUserResponse[]> {
	const res = await fetch(
		`${GHL_BASE_URL}/users/?locationId=${encodeURIComponent(locationId)}`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Version: GHL_API_VERSION,
				Accept: "application/json",
			},
		},
	);
	if (!res.ok) {
		throw new Error(
			`GHL GET /users/?locationId=${locationId} failed: ${res.status} ${await res.text()}`,
		);
	}
	const json = (await res.json()) as GhlUsersListResponse;
	return json.users ?? [];
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

// Suppress unused-helper warnings — these are kept as part of the standard
// inline GHL helper set per spec convention, even though admin path only
// uses get + list.
void ghlGetUser;
void ghlDeleteUser;

test.use({ video: "on" });

test.describe("real GHL — ADMIN", () => {
	test.skip(
		process.env.E2E_REAL_GHL !== "1",
		"Set E2E_REAL_GHL=1 to run live GHL spec",
	);

	test("12 — admin invite+accept SKIPS GHL sync (no /users POST)", async ({
		page,
		context,
	}) => {
		const cp = getControlPanelDb();
		const t = await getTenantDb();

		// ── Lookup a connected branch (for locationId + PIT only) ─────────────
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
		const adminEmail = `developer.avantej+e2eadmin${suffix}@gmail.com`;
		const adminPassword = "TestPass123!";

		let createdAdminUserId: string | null = null;

		try {
			// ── Step 1: Login dev admin ────────────────────────────────────────
			await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

			// ── Step 2: Open Invitations tab ───────────────────────────────────
			await page.goto(
				"/dashboard/access-control/user-assignment?tab=invitations",
			);
			await page.waitForLoadState("networkidle");

			// ── Step 3: Open dialog + select Admin role ────────────────────────
			await page.getByRole("button", { name: "Invite Member" }).first().click();
			const dialog = page.locator('[role="dialog"]');
			await expect(dialog).toBeVisible({ timeout: 5_000 });

			await dialog.locator("#email").fill(adminEmail);

			// Switch role from default "staff" to "admin"
			await dialog.locator("#role").click();
			const adminOption = page.getByRole("option", { name: /^Admin$/ }).first();
			await expect(adminOption).toBeVisible({ timeout: 5_000 });
			await adminOption.click();
			await expect(dialog.locator("#role")).toContainText(/admin/i);

			// Hierarchy scope dropdown — for admin the only available scope is
			// the organization root (type=organization, depth=0). Pick the first
			// (only) option.
			await dialog.locator("#hierarchyScopeId").click();
			const orgOption = page
				.getByRole("option", { name: /^Organization:/ })
				.first();
			await expect(orgOption).toBeVisible({ timeout: 5_000 });
			await orgOption.click();

			await dialog.getByRole("button", { name: /Send Invitation/i }).click();
			await expect(dialog).toBeHidden({ timeout: 15_000 });

			// ── Step 4: Read invitation token ──────────────────────────────────
			const inv = await waitForDb(
				() =>
					t.query.invitations.findFirst({
						where: and(
							eq(invitationsTable.email, adminEmail),
							eq(invitationsTable.status, "pending"),
						),
					}),
				{ timeoutMs: 8_000 },
			);
			expect(inv.role).toBe("admin");

			// ── Step 5: Logout ─────────────────────────────────────────────────
			await context.clearCookies();

			// ── Step 6: Atomic signup via accept-invitation ────────────────────
			await page.goto(
				`/accept-invitation?token=${encodeURIComponent(inv.token)}&orgId=${encodeURIComponent(link.organizationId)}`,
			);
			await expect(page.locator("#firstName")).toBeVisible({ timeout: 15_000 });

			await page.locator("#firstName").fill(`E2EAdmin${suffix}`);
			await page.locator("#lastName").fill("SkipGhl");
			await page.locator("#password").fill(adminPassword);
			await page.locator("#confirmPassword").fill(adminPassword);

			await page
				.getByRole("button", { name: /Sign Up & Accept Invitation/i })
				.click();

			await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

			// ── Step 7: DB asserts — admin row exists, NO GHL link row ─────────
			const newUser = await waitForDb(
				() =>
					cp.query.user.findFirst({
						where: eq(userTable.email, adminEmail),
					}),
				{ timeoutMs: 10_000 },
			);
			createdAdminUserId = newUser.id;

			const newMember = await waitForDb(
				() =>
					t.query.members.findFirst({
						where: eq(members.userId, newUser.id),
					}),
				{ timeoutMs: 10_000 },
			);
			expect(newMember.role).toBe("admin");
			expect(newMember.status).toBe("active");

			// hierarchy scope must be the organization root
			const scopeNode = await t.query.hierarchyNodes.findFirst({
				where: eq(hierarchyNodes.id, newMember.hierarchyScopeId),
			});
			expect(
				scopeNode,
				"admin must be scoped to a hierarchy node",
			).toBeTruthy();
			expect(scopeNode?.type).toBe("organization");
			expect(scopeNode?.depth).toBe(0);

			// THE skip assertion: no ghl_user_links row was written for this member.
			// Give the dispatcher a moment to have run (and skipped) before we read.
			await page.waitForTimeout(2_000);
			const orphanLink = await t.query.ghlUserLinks.findFirst({
				where: eq(ghlUserLinks.memberId, newMember.id),
			});
			expect(
				orphanLink,
				"admin must NOT create a ghl_user_links row (non-branch-scope skip)",
			).toBeUndefined();

			// ── Step 8: Confirm GHL itself has no user with this email ────────
			const ghlUsers = await ghlListUsers(apiKey, link.ghlLocationId);
			const match = ghlUsers.find(
				(u) => (u.email ?? "").toLowerCase() === adminEmail.toLowerCase(),
			);
			expect(
				match,
				"GHL sub-account must not contain a user for the new admin email",
			).toBeUndefined();
		} finally {
			const skipCleanup = process.env.E2E_SKIP_GHL_CLEANUP === "1";
			if (skipCleanup) {
				console.log(
					`[teardown] E2E_SKIP_GHL_CLEANUP=1 — leaving Avantej user ${createdAdminUserId} in place for manual inspection`,
				);
				console.log(
					`           adminEmail=${adminEmail}  adminUserId=${createdAdminUserId}`,
				);
				return;
			}

			// ── DB cleanup (no GHL user to delete) ─────────────────────────────
			try {
				if (createdAdminUserId) {
					const newMember = await t.query.members.findFirst({
						where: eq(members.userId, createdAdminUserId),
					});
					if (newMember) {
						// Defensive — should be empty for admins, but clear anyway.
						await t
							.delete(ghlUserLinks)
							.where(eq(ghlUserLinks.memberId, newMember.id));
						await t.delete(members).where(eq(members.id, newMember.id));
					}
					await cp
						.delete(userTable)
						.where(eq(userTable.id, createdAdminUserId));
				}
				await t
					.delete(invitationsTable)
					.where(eq(invitationsTable.email, adminEmail));
			} catch (e) {
				console.warn("[teardown] DB cleanup:", e);
			}
		}
	});
});
