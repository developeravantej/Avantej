/**
 * Plan F.4 — /health scoreboard page (Agent He).
 *
 * Cross-tenant aggregator complementing the per-tenant
 * `platformAdminTenants.health` router. Covers
 * `platformAdminHealth.getScoreboard` shape, histogram math, flag-rollup
 * sort, topAtRiskLimit clamp, RBAC, and UI render.
 *
 * Tagged @ship-f-4.
 */

import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../../../fixtures/db";
import {
	cleanupSeededTestUsers,
	loginAsAdmin,
	signUpUser,
} from "../../../fixtures/auth";

test.use({ video: "on" });

test.afterAll(async () => {
	// Revoke platform-admin grants + delete throwaway @test.local users this
	// spec seeded, even if an assertion failed mid-test (see fixtures/auth.ts).
	await cleanupSeededTestUsers();
});

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

test.describe("@ship-f-4 Plan F.4 — Agent He /health scoreboard", () => {
	test("getScoreboard RPC + UI render + RBAC", async ({ page, context }) => {
		test.setTimeout(180_000);

		page.on("console", (m) => {
			if (m.type() === "error") {
				console.log("[browser-console-error]", m.text());
			}
		});

		const cp = getControlPanelDb();

		let adminEmail: string;
		let adminPassword: string;
		let adminUserId: string;
		if (ENV_SUPER_ADMIN_EMAIL && ENV_SUPER_ADMIN_PASSWORD) {
			const existing = await cp.query.user.findFirst({
				where: eq(userTable.email, ENV_SUPER_ADMIN_EMAIL),
			});
			if (!existing)
				throw new Error(
					`E2E_SUPER_ADMIN_EMAIL ${ENV_SUPER_ADMIN_EMAIL} not found`,
				);
			adminEmail = ENV_SUPER_ADMIN_EMAIL;
			adminPassword = ENV_SUPER_ADMIN_PASSWORD;
			adminUserId = existing.id;
		} else {
			const suffix = `plan-f-4-he-${Date.now()}`;
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
			.select({ id: platformAdmins.id, role: platformAdmins.role })
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

		await loginAsAdmin(page, adminEmail, adminPassword);
		const apiCtx = context.request;

		// Scenario 1: getScoreboard RPC shape.
		const r1 = await rpc(apiCtx, "platformAdminHealth/getScoreboard", {});
		console.log(
			`[scenario-1] getScoreboard default status=${r1.status} body=${JSON.stringify(r1.body).slice(0, 400)}`,
		);
		expect(r1.status).toBe(200);
		const sb = r1.body?.json ?? r1.body;
		expect(typeof sb).toBe("object");
		expect(Array.isArray(sb.histogram?.bands)).toBe(true);
		expect(sb.histogram.bands.length).toBe(5);
		expect(typeof sb.histogram.totalScoredOrgs).toBe("number");
		expect(typeof sb.histogram.unscoredOrgs).toBe("number");
		expect(Array.isArray(sb.topAtRisk)).toBe(true);
		expect(Array.isArray(sb.flagRollup)).toBe(true);
		expect(Array.isArray(sb.trend?.avgScoreLast30dByDay)).toBe(true);

		// Scenario 2: histogram math — sum of band counts === totalScoredOrgs,
		// monotonically increasing min + max.
		const bandSum = sb.histogram.bands.reduce(
			(s: number, b: any) => s + b.count,
			0,
		);
		expect(bandSum).toBe(sb.histogram.totalScoredOrgs);
		for (let i = 1; i < sb.histogram.bands.length; i++) {
			expect(sb.histogram.bands[i].min).toBeGreaterThan(
				sb.histogram.bands[i - 1].min,
			);
			expect(sb.histogram.bands[i].max).toBeGreaterThan(
				sb.histogram.bands[i - 1].max,
			);
		}

		// Scenario 3: flag rollup sorted by count DESC.
		for (let i = 1; i < sb.flagRollup.length; i++) {
			expect(sb.flagRollup[i].count).toBeLessThanOrEqual(
				sb.flagRollup[i - 1].count,
			);
		}

		// Scenario 4: topAtRiskLimit clamp.
		const r4 = await rpc(apiCtx, "platformAdminHealth/getScoreboard", {
			topAtRiskLimit: 5,
		});
		expect(r4.status).toBe(200);
		const narrow = r4.body?.json ?? r4.body;
		expect(narrow.topAtRisk.length).toBeLessThanOrEqual(5);
		// topAtRisk sorted ASC by healthScore.
		for (let i = 1; i < narrow.topAtRisk.length; i++) {
			expect(narrow.topAtRisk[i].healthScore).toBeGreaterThanOrEqual(
				narrow.topAtRisk[i - 1].healthScore,
			);
		}

		// Scenario 5: UI render.
		await page.goto("/dashboard/platform-admin/health");
		await page.waitForLoadState("networkidle").catch(() => {});

		const html = await page.content();
		const has500 = /Internal Server Error|status code 500|500 -/i.test(html);
		console.log(`[scenario-5] health page has500=${has500}`);
		expect(has500).toBe(false);

		const headingVisible = await page
			.getByRole("heading", { name: "Health Scoreboard" })
			.waitFor({ state: "visible", timeout: 15_000 })
			.then(() => true)
			.catch(() => false);
		console.log(`[scenario-5] heading visible=${headingVisible}`);
		expect(headingVisible).toBe(true);

		await expect(page.getByTestId("health-histogram")).toBeVisible();
		// Either populated bars or empty-state should render inside the card.
		const barsOrEmpty = await page
			.getByTestId("health-histogram-bars")
			.or(page.getByTestId("health-histogram-empty"))
			.first()
			.waitFor({ state: "visible", timeout: 10_000 })
			.then(() => true)
			.catch(() => false);
		expect(barsOrEmpty).toBe(true);
		await expect(page.getByTestId("at-risk-widget")).toBeVisible();
		await expect(page.getByTestId("risk-flag-rollup")).toBeVisible();
		await expect(page.getByTestId("health-trend-card")).toBeVisible();

		// Scenario 6: RBAC — support role still gets 200 (read-only).
		await cp
			.update(platformAdmins)
			.set({ role: "support" })
			.where(eq(platformAdmins.userId, adminUserId));
		const r6 = await rpc(apiCtx, "platformAdminHealth/getScoreboard", {});
		console.log(`[scenario-6] support-role status=${r6.status}`);
		expect(r6.status).toBe(200);
		await cp
			.update(platformAdmins)
			.set({ role: "super_admin" })
			.where(eq(platformAdmins.userId, adminUserId));
	});
});
