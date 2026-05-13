/**
 * Demo walkthrough 13: Real GHL `/users/` sync for the TRAINER role.
 *
 * Mirrors spec 07 line-for-line, but invites a `trainer` (scoped to a branch)
 * instead of `staff`. Asserts the live `POST /users/` round-trip produced a
 * GHL user with the role/permissions/scopes bundle defined for trainers in
 * `apps/server/src/services/ghl/payload-builders.ts` (ROLE_CAPABILITIES.trainer).
 *
 * Skipped unless E2E_REAL_GHL=1. Run via:
 *   bun run -F web e2e:test:real --grep "13"
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
 *   - tenant.members.role = "trainer", status = "active"
 *   - tenant.ghl_user_links syncStatus='active', ghlUserId is real (not mock_*)
 *   - GHL GET /users/:id returns:
 *       email/firstName/lastName match what we submitted
 *       roles.role = "user", type = "account"
 *       permissions.{contacts,conversations,appointments,opportunities,
 *                    calendars,assignedDataOnly}Enabled = true
 *       scopes contains contacts.write, conversations.write,
 *                       opportunities.write, calendars.write
 *       scopesAssignedToOnly matches scopes
 *
 * Produces: test-results/13-trainer-ghl-sync-real-chromium/video.webm
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
	type?: string;
	roles?: { role?: string; locationIds?: string[] };
	permissions?: Record<string, boolean>;
	scopes?: string[];
	scopesAssignedToOnly?: string[];
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

// ghlListUsers is kept for parity with the inline GHL helper set (used by
// sibling specs). Not invoked in the trainer round-trip itself.
void ghlListUsers;

test.use({ video: "on" });

test.describe("real GHL — TRAINER", () => {
	test.skip(
		process.env.E2E_REAL_GHL !== "1",
		"Set E2E_REAL_GHL=1 to run live GHL spec",
	);

	test("13 — trainer invite+accept against live GHL Users API", async ({
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
		const trainerEmail = `developer.avantej+e2etrainer${suffix}@gmail.com`;
		const trainerPassword = "TestPass123!";

		let createdTrainerUserId: string | null = null;
		let createdGhlUserId: string | null = null;

		try {
			// ── Step 1: Login admin ─────────────────────────────────────────────
			await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

			// ── Step 2: Open Invitations tab ───────────────────────────────────
			await page.goto(
				"/dashboard/access-control/user-assignment?tab=invitations",
			);
			await page.waitForLoadState("networkidle");

			// ── Step 3: Open dialog + select Trainer role ──────────────────────
			await page.getByRole("button", { name: "Invite Member" }).first().click();
			const dialog = page.locator('[role="dialog"]');
			await expect(dialog).toBeVisible({ timeout: 5_000 });

			await dialog.locator("#email").fill(trainerEmail);

			await dialog.locator("#role").click();
			const trainerOption = page
				.getByRole("option", { name: /^Trainer$/ })
				.first();
			await expect(trainerOption).toBeVisible({ timeout: 5_000 });
			await trainerOption.click();
			await expect(dialog.locator("#role")).toContainText(/trainer/i);

			// Hierarchy scope — branches are available because role != admin.
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
							eq(invitationsTable.email, trainerEmail),
							eq(invitationsTable.status, "pending"),
						),
					}),
				{ timeoutMs: 8_000 },
			);
			expect(inv.role).toBe("trainer");

			// ── Step 5: Logout ─────────────────────────────────────────────────
			await context.clearCookies();

			// ── Step 6: Atomic signup ──────────────────────────────────────────
			await page.goto(
				`/accept-invitation?token=${encodeURIComponent(inv.token)}&orgId=${encodeURIComponent(link.organizationId)}`,
			);
			await expect(page.locator("#firstName")).toBeVisible({ timeout: 15_000 });

			await page.locator("#firstName").fill("E2ETrainer");
			await page.locator("#lastName").fill("Test");
			await page.locator("#password").fill(trainerPassword);
			await page.locator("#confirmPassword").fill(trainerPassword);

			await page
				.getByRole("button", { name: /Sign Up & Accept Invitation/i })
				.click();

			// Real GHL POST + DB writes — give it generous timeout
			await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

			// ── Step 7: DB asserts ─────────────────────────────────────────────
			const newUser = await waitForDb(
				() =>
					cp.query.user.findFirst({
						where: eq(userTable.email, trainerEmail),
					}),
				{ timeoutMs: 10_000 },
			);
			createdTrainerUserId = newUser.id;

			const newMember = await waitForDb(
				() =>
					t.query.members.findFirst({
						where: eq(members.userId, newUser.id),
					}),
				{ timeoutMs: 10_000 },
			);
			expect(newMember.role).toBe("trainer");
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

			// ── Step 8: Round-trip to GHL — verify trainer capability bundle ──
			const ghlUser = await ghlGetUser(apiKey, userLink.ghlUserId);
			expect(ghlUser.id).toBe(userLink.ghlUserId);
			expect((ghlUser.email ?? "").toLowerCase()).toBe(
				trainerEmail.toLowerCase(),
			);
			expect(ghlUser.firstName).toBe("E2ETrainer");
			expect(ghlUser.lastName).toBe("Test");

			// Role / type — trainer = GHL "user" (NOT admin), account-type
			expect(ghlUser.type).toBe("account");
			expect(ghlUser.roles?.role).toBe("user");

			// Permissions — matches ROLE_CAPABILITIES.trainer in payload-builders.ts
			const perms = ghlUser.permissions ?? {};
			expect(perms.contactsEnabled).toBe(true);
			expect(perms.conversationsEnabled).toBe(true);
			expect(perms.appointmentsEnabled).toBe(true);
			expect(perms.opportunitiesEnabled).toBe(true);
			expect(perms.calendarsEnabled).toBe(true);
			expect(perms.assignedDataOnly).toBe(true);

			// Scopes — exactly the trainer bundle
			const scopes = ghlUser.scopes ?? [];
			expect(scopes).toEqual(
				expect.arrayContaining([
					"contacts.write",
					"conversations.write",
					"opportunities.write",
					"calendars.write",
				]),
			);

			// scopesAssignedToOnly is set to the same array on POST — assert it
			// echoes back the same set (order-independent).
			const scopesAssignedToOnly = ghlUser.scopesAssignedToOnly ?? [];
			expect(scopesAssignedToOnly.slice().sort()).toEqual(
				scopes.slice().sort(),
			);
		} finally {
			const skipCleanup = process.env.E2E_SKIP_GHL_CLEANUP === "1";
			if (skipCleanup) {
				console.log(
					`[teardown] E2E_SKIP_GHL_CLEANUP=1 — leaving GHL user ${createdGhlUserId} + DB rows in place for manual inspection`,
				);
				console.log(
					`           trainerEmail=${trainerEmail}  ghlUserId=${createdGhlUserId}  trainerUserId=${createdTrainerUserId}`,
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
				if (createdTrainerUserId) {
					const newMember = await t.query.members.findFirst({
						where: eq(members.userId, createdTrainerUserId),
					});
					if (newMember) {
						await t
							.delete(ghlUserLinks)
							.where(eq(ghlUserLinks.memberId, newMember.id));
						await t.delete(members).where(eq(members.id, newMember.id));
					}
					await cp
						.delete(userTable)
						.where(eq(userTable.id, createdTrainerUserId));
				}
				await t
					.delete(invitationsTable)
					.where(eq(invitationsTable.email, trainerEmail));
			} catch (e) {
				console.warn("[teardown] DB cleanup:", e);
			}
		}
	});
});
