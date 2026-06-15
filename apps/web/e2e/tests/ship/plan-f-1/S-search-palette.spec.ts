/**
 * Plan F.1 — Cross-Tenant Search ⌘K Palette (Agent S).
 *
 * Scenarios:
 *   1. Golden: ⌘K opens palette → search by org name substring → click → URL drill-in.
 *   2. Empty hint + "No matches" + ESC closes.
 *   3. Pathname gate: outside /dashboard/platform-admin → ⌘K does NOT open.
 *   4. Match-type ranking (id > slug > name > email) via RPC ranking check.
 *   5. RBAC: skipped per spec (read-only, all admin roles equal).
 *
 * Auth: provisions a fresh super-admin user (or reuses
 *       E2E_SUPER_ADMIN_EMAIL/_PASSWORD) and marks email verified.
 *       No DB migration needed — search uses existing tables only.
 */

import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../../../fixtures/db";
import { loginAsAdmin, signUpUser } from "../../../fixtures/auth";

test.use({ video: "on" });

const ENV_SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const ENV_SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;
const WEB_ORIGIN = process.env.E2E_WEB_BASE_URL ?? "http://localhost:3001";

async function rpc(
	request: APIRequestContext,
	router: string,
	input: unknown,
): Promise<{ status: number; body: any }> {
	const res = await request.post(`${WEB_ORIGIN}/rpc/${router}`, {
		headers: { "Content-Type": "application/json" },
		data: { json: input },
	});
	const text = await res.text();
	let body: any = text;
	try {
		body = JSON.parse(text);
	} catch {}
	return { status: res.status(), body };
}

function pickResults(body: any): Array<{
	orgId: string;
	orgName: string;
	slug: string;
	matchType: string;
}> {
	return (body?.json?.results ?? body?.results ?? []) as Array<any>;
}

test.describe("@ship-f-1 Plan F.1 — Cross-Tenant Search ⌘K Palette", () => {
	test("⌘K palette: golden, empty, no-results, gate, ranking", async ({
		page,
		context,
	}) => {
		test.setTimeout(120_000);
		const cp = getControlPanelDb();

		// ── Setup: provision super-admin ───────────────────────────────────
		let adminEmail: string;
		let adminPassword: string;
		let adminUserId: string;
		if (ENV_SUPER_ADMIN_EMAIL && ENV_SUPER_ADMIN_PASSWORD) {
			const existing = await cp.query.user.findFirst({
				where: eq(userTable.email, ENV_SUPER_ADMIN_EMAIL),
			});
			if (!existing) {
				throw new Error(
					`E2E_SUPER_ADMIN_EMAIL ${ENV_SUPER_ADMIN_EMAIL} not found in DB`,
				);
			}
			adminEmail = ENV_SUPER_ADMIN_EMAIL;
			adminPassword = ENV_SUPER_ADMIN_PASSWORD;
			adminUserId = existing.id;
		} else {
			const suffix = `plan-f-1-s-${Date.now()}`;
			const signed = await signUpUser(suffix, "admin");
			adminEmail = signed.email;
			adminPassword = signed.password;
			adminUserId = signed.userId;
		}

		await cp
			.update(userTable)
			.set({ emailVerified: true })
			.where(eq(userTable.id, adminUserId));

		const existingPa = await cp
			.select({ role: platformAdmins.role })
			.from(platformAdmins)
			.where(eq(platformAdmins.userId, adminUserId));
		if (existingPa.length === 0) {
			await cp
				.insert(platformAdmins)
				.values({ userId: adminUserId, role: "super_admin" });
		} else if (existingPa[0]!.role !== "super_admin") {
			await cp
				.update(platformAdmins)
				.set({ role: "super_admin" })
				.where(eq(platformAdmins.userId, adminUserId));
		}

		// Pick a sample org to query for.
		const orgRows = await cp
			.select({
				id: organizations.id,
				name: organizations.name,
				slug: organizations.slug,
			})
			.from(organizations)
			.limit(1);
		if (orgRows.length === 0)
			throw new Error("No organizations seeded in control-panel DB");
		const sampleOrg = orgRows[0]!;
		// Substring of the org name (first 3 chars), URL-safe.
		const nameSubstr = sampleOrg.name.slice(
			0,
			Math.min(3, sampleOrg.name.length),
		);

		// ── Browser login ──────────────────────────────────────────────────
		await loginAsAdmin(page, adminEmail, adminPassword);
		const apiCtx = context.request;

		// ── Scenario 1: Golden — open palette, type, click row ─────────────
		await page.goto("/dashboard/platform-admin/tenants");
		await page.waitForLoadState("networkidle");

		const isMac = process.platform === "darwin";
		const hotkey = isMac ? "Meta+k" : "Control+k";
		await page.keyboard.press(hotkey);

		const palette = page.getByTestId("command-palette");
		await expect(palette).toBeVisible({ timeout: 5_000 });

		// Empty hint visible initially.
		await expect(page.getByTestId("command-palette-empty-hint")).toBeVisible();

		const input = page.getByTestId("command-palette-input");
		await input.fill(nameSubstr);

		// Wait for at least one row (debounce 250ms + RPC).
		const targetRow = page.getByTestId(`command-palette-row-${sampleOrg.id}`);
		await expect(targetRow).toBeVisible({ timeout: 10_000 });

		await targetRow.click();
		await page.waitForURL(
			new RegExp(`/dashboard/platform-admin/tenants/${sampleOrg.id}`),
			{ timeout: 10_000 },
		);
		await expect(palette).not.toBeVisible();

		// ── Scenario 2: No results + ESC closes ────────────────────────────
		await page.goto("/dashboard/platform-admin/tenants");
		await page.waitForLoadState("networkidle");
		await page.keyboard.press(hotkey);
		await expect(palette).toBeVisible({ timeout: 5_000 });
		await page
			.getByTestId("command-palette-input")
			.fill("zzznomatch-xyz-12345");
		await expect(page.getByTestId("command-palette-no-results")).toBeVisible({
			timeout: 10_000,
		});
		await page.keyboard.press("Escape");
		await expect(palette).not.toBeVisible({ timeout: 5_000 });

		// ── Scenario 3: Pathname gate — palette not mounted outside ────────
		// Navigate somewhere under /dashboard but NOT platform-admin. Use the
		// raw root and assert no palette element exists.
		await page.goto("/dashboard");
		await page.waitForLoadState("networkidle").catch(() => {});
		await page.keyboard.press(hotkey);
		// Wait a beat for any potential mount, then assert absent.
		await page.waitForTimeout(500);
		const offRouteVisible = await page
			.getByTestId("command-palette")
			.isVisible()
			.catch(() => false);
		expect(offRouteVisible).toBe(false);

		// ── Scenario 4: Match-type ranking via RPC ─────────────────────────
		// Use the org id — must come back as matchType "id".
		const idRes = await rpc(apiCtx, "platformAdminTenants/search/search", {
			query: sampleOrg.id,
		});
		expect(idRes.status, JSON.stringify(idRes.body)).toBe(200);
		const idResults = pickResults(idRes.body);
		expect(idResults.length).toBeGreaterThanOrEqual(1);
		expect(idResults[0]!.matchType).toBe("id");
		expect(idResults[0]!.orgId).toBe(sampleOrg.id);

		// Query by slug substring — should rank slug above name where overlap.
		const slugSubstr = sampleOrg.slug.slice(
			0,
			Math.min(4, sampleOrg.slug.length),
		);
		const slugRes = await rpc(apiCtx, "platformAdminTenants/search/search", {
			query: slugSubstr,
		});
		expect(slugRes.status, JSON.stringify(slugRes.body)).toBe(200);
		const slugResults = pickResults(slugRes.body);
		expect(slugResults.length).toBeGreaterThanOrEqual(1);
		// Sample org should appear; if its slug starts with the substring, it's
		// matched on slug. If it only matches via name, that's also acceptable —
		// but slug > name ranking must hold across results.
		const sampleHit = slugResults.find((r) => r.orgId === sampleOrg.id);
		expect(sampleHit).toBeTruthy();
		// Ensure ordering is by rank: every slug match precedes every email match.
		const ranks = { id: 0, slug: 1, name: 2, email: 3 } as const;
		for (let i = 1; i < slugResults.length; i++) {
			const prev = ranks[slugResults[i - 1]!.matchType as keyof typeof ranks];
			const cur = ranks[slugResults[i]!.matchType as keyof typeof ranks];
			expect(prev).toBeLessThanOrEqual(cur);
		}
	});
});
