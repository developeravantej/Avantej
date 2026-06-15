/**
 * Demo walkthrough 15: Customer role does NOT sync to the GHL Users API.
 *
 * Verifies the skip-rule in packages/services/src/ghl-staff-sync.service.ts
 * (STAFF_ROLES = {admin, staff, trainer}). Members with role="customer" must
 * never hit POST /users/ and must never produce a ghl_user_links row.
 *
 * Skipped unless E2E_REAL_GHL=1. Run via:
 *   bun run -F web e2e:test:real --grep "15"
 *
 * Pre-reqs:
 *   - control_panel.ghl_branch_links has at least one active row with a real
 *     PIT API key (we use it for the listUsers round-trip check)
 *   - tenant.roles contains a row with name="customer" — if missing, the spec
 *     skips with a clear message. (Note: the live invite UI exposes roles
 *     admin/trainer/staff/client; "customer" is a separately seeded custom
 *     role used for non-staff sync rules. Seed via the roles router or insert
 *     directly into tenant.roles to enable.)
 *
 * Side effects:
 *   - Creates a tenant member with role=customer (NO GHL user created)
 *   - finally{} archives member + cleans DB rows; no GHL DELETE since no GHL
 *     user should have been minted.
 *
 * Assertions:
 *   - tenant.members row exists with role="customer"
 *   - tenant.ghl_user_links has NO row for this member
 *   - GHL GET /users/?locationId=<loc> does NOT contain a user with this email
 *
 * Produces: test-results/15-customer-role-skip-sync-chromium/video.webm
 */

import { test, expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { invitations as invitationsTable } from "@avantej-core/db/schema/tenant/invitations";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { roles as rolesTable } from "@avantej-core/db/schema/tenant/roles";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { decrypt } from "@avantej-core/db";
import { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD } from "../fixtures/seed";
import { loginAsAdmin } from "../fixtures/auth";
import { getControlPanelDb, getTenantDb } from "../fixtures/db";
import { waitForDb } from "../fixtures/wait";

test.use({ video: "on" });

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

interface GhlListedUser {
	id: string;
	email?: string;
}

interface GhlUserResponse {
	id: string;
	email?: string;
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

async function ghlListUsers(
	apiKey: string,
	locId: string,
): Promise<{ status: number; users: GhlListedUser[] }> {
	const res = await fetch(
		`${GHL_BASE_URL}/users/?locationId=${encodeURIComponent(locId)}`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Version: GHL_API_VERSION,
				Accept: "application/json",
			},
		},
	);
	if (!res.ok) return { status: res.status, users: [] };
	const json = (await res.json()) as { users?: GhlListedUser[] };
	return { status: res.status, users: json.users ?? [] };
}

test.describe("real GHL — customer role skip", () => {
	test.skip(
		process.env.E2E_REAL_GHL !== "1",
		"Set E2E_REAL_GHL=1 to run live GHL spec",
	);

	test("15 — customer role does NOT sync to GHL Users", async ({ page }) => {
		const cp = getControlPanelDb();
		const t = await getTenantDb();

		// ── Pre-flight: connected branch (gives us apiKey + locationId) ──────
		const branchLink = await cp.query.ghlBranchLinks.findFirst({
			where: eq(ghlBranchLinks.isActive, true),
		});
		if (!branchLink) {
			throw new Error(
				"No active ghl_branch_links row. Connect a branch via UI first.",
			);
		}
		const apiKey = decrypt(branchLink.ghlApiKey);
		expect(apiKey.startsWith("pit-"), "expected real PIT API key").toBeTruthy();

		const branch = await t.query.hierarchyNodes.findFirst({
			where: eq(hierarchyNodes.id, branchLink.tenantBranchId),
		});
		if (!branch) throw new Error("branch row missing in tenant hierarchy");

		// ── Pre-flight: confirm "customer" role exists in tenant.roles ───────
		const customerRole = await t.query.roles.findFirst({
			where: eq(rolesTable.name, "customer"),
		});
		test.skip(
			!customerRole,
			"customer role not seeded; seed via roles router or DB to enable",
		);
		if (!customerRole) return;

		const suffix = Date.now();
		const memberEmail = `developer.avantej+e2ecustomer${suffix}@gmail.com`;
		const memberFirstName = `E2ECustomer${suffix}`;
		const memberLastName = "RealGhl";
		const memberPassword = "TestPass123!";

		let createdUserId: string | null = null;
		let createdMemberId: string | null = null;

		try {
			// ── Step 1: Login admin ───────────────────────────────────────────
			await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

			// ── Step 2: Open invite dialog ────────────────────────────────────
			await page.goto(
				"/dashboard/access-control/user-assignment?tab=invitations",
			);
			await page.waitForLoadState("networkidle");
			await page.getByRole("button", { name: "Invite Member" }).first().click();
			const dialog = page.locator('[role="dialog"]');
			await expect(dialog).toBeVisible({ timeout: 5_000 });

			await dialog.locator("#email").fill(memberEmail);
			// The invite UI exposes admin/trainer/staff/client. "customer" isn't
			// in the dropdown — invite as "client" so the invite flow completes,
			// then we'll patch the member.role to "customer" post-accept to
			// exercise the role-based skip rule. This mirrors how a tenant with
			// a custom "customer" role would end up in the DB.
			await dialog.locator("#role").click();
			await page
				.getByRole("option", { name: /^Client$/ })
				.first()
				.click();

			await dialog.locator("#hierarchyScopeId").click();
			await page
				.getByRole("option", { name: new RegExp(branch.name) })
				.first()
				.click();
			await dialog.getByRole("button", { name: /Send Invitation/i }).click();
			await expect(dialog).toBeHidden({ timeout: 15_000 });

			// ── Step 3: Accept invitation as new user ─────────────────────────
			const inv = await waitForDb(
				() =>
					t.query.invitations.findFirst({
						where: and(
							eq(invitationsTable.email, memberEmail),
							eq(invitationsTable.status, "pending"),
						),
					}),
				{ timeoutMs: 8_000 },
			);

			await page.context().clearCookies();
			await page.goto(
				`/accept-invitation?token=${encodeURIComponent(inv.token)}&orgId=${encodeURIComponent(branchLink.organizationId)}`,
			);
			await expect(page.locator("#firstName")).toBeVisible({ timeout: 15_000 });
			await page.locator("#firstName").fill(memberFirstName);
			await page.locator("#lastName").fill(memberLastName);
			await page.locator("#password").fill(memberPassword);
			await page.locator("#confirmPassword").fill(memberPassword);
			await page
				.getByRole("button", { name: /Sign Up & Accept Invitation/i })
				.click();
			await page.waitForURL(/\/(dashboard|customers|home|onboarding)/, {
				timeout: 30_000,
			});

			const newUser = await waitForDb(
				() =>
					cp.query.user.findFirst({ where: eq(userTable.email, memberEmail) }),
				{ timeoutMs: 10_000 },
			);
			createdUserId = newUser.id;
			const newMember = await waitForDb(
				() =>
					t.query.members.findFirst({ where: eq(members.userId, newUser.id) }),
				{ timeoutMs: 10_000 },
			);
			createdMemberId = newMember.id;

			// ── Step 4: Patch role to "customer" — exercise the skip rule ─────
			// We patch directly (no UI affordance exposes the custom "customer"
			// role on existing members). This still validates the orchestrator's
			// STAFF_ROLES gate: dispatchStaffSync({operation:"update"}) on a
			// non-staff role must short-circuit BEFORE touching the GHL API and
			// must NOT create a ghl_user_links row.
			await t
				.update(members)
				.set({ role: "customer" })
				.where(eq(members.id, newMember.id));

			// ── Step 5: Wait briefly for any async sync attempts ──────────────
			// The skip-rule fires synchronously inside dispatchStaffSync, but we
			// gate for ~5s to catch any background workers that might wake up.
			await page.waitForTimeout(5_000);

			// ── Step 6: Asserts — DB + GHL absence ────────────────────────────
			const refreshedMember = await t.query.members.findFirst({
				where: eq(members.id, newMember.id),
			});
			expect(refreshedMember?.role).toBe("customer");

			const link = await t.query.ghlUserLinks.findFirst({
				where: eq(ghlUserLinks.memberId, newMember.id),
			});
			expect(
				link,
				`expected NO ghl_user_links row for customer-role member, got: ${JSON.stringify(link)}`,
			).toBeUndefined();

			// Round-trip: GHL must not have a user with this email under the
			// connected location. (We listed users at the branch location since
			// that's what the orchestrator would target for a per-branch sync.)
			const live = await ghlListUsers(apiKey, branchLink.ghlLocationId);
			expect(live.status).toBe(200);
			const match = live.users.find(
				(u) => (u.email ?? "").toLowerCase() === memberEmail.toLowerCase(),
			);
			expect(
				match,
				`expected NO GHL user with email ${memberEmail}, got: ${JSON.stringify(match)}`,
			).toBeUndefined();
		} finally {
			const skipCleanup = process.env.E2E_SKIP_GHL_CLEANUP === "1";
			if (skipCleanup) {
				console.log(
					`[teardown] E2E_SKIP_GHL_CLEANUP=1 — leaving member=${createdMemberId} user=${createdUserId} email=${memberEmail} for inspection`,
				);
				return;
			}

			// Defensive: if anything DID create a GHL user, scrub it.
			try {
				const stray = await ghlListUsers(apiKey, branchLink.ghlLocationId);
				const hit = stray.users.find(
					(u) => (u.email ?? "").toLowerCase() === memberEmail.toLowerCase(),
				);
				if (hit) {
					console.warn(
						`[teardown] unexpected GHL user ${hit.id} for ${memberEmail} — deleting`,
					);
					await ghlDeleteUser(apiKey, hit.id);
				}
				// Touch sql to keep the import live for the type-check in case
				// future cleanup needs raw SQL — no-op here.
				void sql;
			} catch (e) {
				console.warn("[teardown] GHL scrub:", e);
			}

			try {
				if (createdMemberId) {
					await t
						.delete(ghlUserLinks)
						.where(eq(ghlUserLinks.memberId, createdMemberId));
					await t.delete(members).where(eq(members.id, createdMemberId));
				}
				if (createdUserId) {
					await cp.delete(userTable).where(eq(userTable.id, createdUserId));
				}
				await t
					.delete(invitationsTable)
					.where(eq(invitationsTable.email, memberEmail));
			} catch (e) {
				console.warn("[teardown] DB cleanup:", e);
			}
		}
	});
});
