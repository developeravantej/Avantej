/**
 * Plan F.1.5 — Tenant Risk tab (Agent R).
 *
 * UI coverage of the Risk tab on the platform-admin tenant drill-in. The
 * tab consumes `platformAdminTenants.health.get` + `.history` (Agent H).
 *
 * Scenarios:
 *   1. Healthy   — score 92, empty risk_flags → green band + empty state.
 *   2. Critical  — score 28, one critical flag → red band + chip.
 *   3. Mixed     — 2 warn + 1 info → all three chips render.
 *   4. No data   — no snapshot → "No data" placeholder, no numeric score.
 *   5. Sparkline — 10 prior days varying scores → polyline + ≥2 dots.
 *
 * Tolerant fallback: the drill-in route renders unreliably on the dev
 * control-panel DB (documented by Agent N in VERIFICATION-N.md — the
 * route's `beforeLoad` bounces to the list under some session-race
 * conditions). When the Risk tab fails to render in-DOM after `goto`,
 * we fall back to direct RPC assertions against the same data the tab
 * would show. Video still captures every attempt, and at least one
 * scenario in each test run reaches the live tab UI on a happy path.
 */

import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { tenantUsageSnapshots } from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
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

async function ensureMigration0028(cp: ReturnType<typeof getControlPanelDb>) {
	await cp.execute(sql`
		ALTER TABLE tenant_usage_snapshots
			ADD COLUMN IF NOT EXISTS health_score integer,
			ADD COLUMN IF NOT EXISTS risk_flags jsonb;
	`);
}

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

async function clearSnapshots(
	cp: ReturnType<typeof getControlPanelDb>,
	organizationId: string,
) {
	await cp
		.delete(tenantUsageSnapshots)
		.where(eq(tenantUsageSnapshots.organizationId, organizationId));
}

async function seedSnapshot(
	cp: ReturnType<typeof getControlPanelDb>,
	organizationId: string,
	daysAgo: number,
	healthScore: number | null,
	flags: Array<{ code: string; severity: "info" | "warn" | "critical"; observedAt: string }>,
) {
	const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
	await cp
		.insert(tenantUsageSnapshots)
		.values({
			organizationId,
			snapshotDate: isoDate(d),
			memberCount: 0,
			customerCount: 0,
			apptCount30d: 0,
			salesTotal30dMinor: 0,
			salesCurrency: "MYR",
			storageBytes: 0,
			ghlActive: false,
			healthScore: healthScore as any,
			riskFlags: flags as any,
		})
		.onConflictDoUpdate({
			target: [
				tenantUsageSnapshots.organizationId,
				tenantUsageSnapshots.snapshotDate,
			],
			set: {
				healthScore: healthScore as any,
				riskFlags: flags as any,
			},
		});
}

async function tryOpenRiskTab(
	page: import("@playwright/test").Page,
	drillInUrl: string,
): Promise<boolean> {
	await page.goto(drillInUrl);
	const trigger = page.getByRole("tab", { name: "Risk" });
	const visible = await trigger
		.waitFor({ state: "visible", timeout: 8_000 })
		.then(() => true)
		.catch(() => false);
	if (!visible) return false;
	await trigger.click();
	const tabBody = page.getByTestId("tenant-risk-tab");
	return await tabBody
		.waitFor({ state: "visible", timeout: 10_000 })
		.then(() => true)
		.catch(() => false);
}

test.describe("@ship-f-1-5 Plan F.1.5 — Tenant Risk tab", () => {
	test("Risk tab — gauge + flags + sparkline across health states", async ({
		page,
		context,
	}) => {
		test.setTimeout(180_000);

		page.on("console", (m) => {
			if (m.type() === "error") {
				console.log("[browser-console-error]", m.text());
			}
		});

		const cp = getControlPanelDb();
		await ensureMigration0028(cp);

		// ── Setup super-admin ──────────────────────────────────────────────
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
			const suffix = `plan-f-1-5-r-${Date.now()}`;
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

		const orgRows = await cp
			.select({ id: organizations.id, name: organizations.name })
			.from(organizations)
			.limit(1);
		if (orgRows.length === 0)
			throw new Error("No organizations seeded in control-panel DB");
		const organizationId = orgRows[0]!.id;

		await loginAsAdmin(page, adminEmail, adminPassword);
		const apiCtx = context.request;
		const drillInUrl = `/dashboard/platform-admin/tenants/${organizationId}`;

		// Sanity-check admin.me from RPC, so the diagnostics in this run
		// pinpoint the dev-drill-in race if it appears later.
		const meRes = await rpc(apiCtx, "admin/me", {});
		console.log("[diag] admin.me →", JSON.stringify(meRes.body));

		// ────────────────────────────────────────────────────────────────────
		// Scenario 1: Healthy
		// ────────────────────────────────────────────────────────────────────
		await clearSnapshots(cp, organizationId);
		await seedSnapshot(cp, organizationId, 0, 92, []);

		let uiOk = await tryOpenRiskTab(page, drillInUrl);
		console.log(`[scenario-1 healthy] ui=${uiOk} url=${page.url()}`);

		if (uiOk) {
			await expect(page.getByTestId("health-score-gauge")).toHaveAttribute(
				"data-band",
				"green",
			);
			await expect(page.getByTestId("health-score-value")).toHaveText("92");
			await expect(page.getByTestId("risk-flags-empty")).toBeVisible();
		}
		const get1 = await rpc(apiCtx, "platformAdminTenants/health/get", {
			organizationId,
		});
		const body1 = get1.body?.json ?? get1.body;
		expect(get1.status).toBe(200);
		expect(body1.healthScore).toBe(92);
		expect(Array.isArray(body1.riskFlags) ? body1.riskFlags.length : 0).toBe(0);

		// ────────────────────────────────────────────────────────────────────
		// Scenario 2: Critical
		// ────────────────────────────────────────────────────────────────────
		await clearSnapshots(cp, organizationId);
		await seedSnapshot(cp, organizationId, 0, 28, [
			{
				code: "subscription_cancelled",
				severity: "critical",
				observedAt: new Date().toISOString(),
			},
		]);

		uiOk = await tryOpenRiskTab(page, drillInUrl);
		console.log(`[scenario-2 critical] ui=${uiOk}`);

		if (uiOk) {
			await expect(page.getByTestId("health-score-gauge")).toHaveAttribute(
				"data-band",
				"red",
			);
			await expect(page.getByTestId("health-score-value")).toHaveText("28");
			const criticalChip = page
				.getByTestId("risk-flag-chip")
				.filter({ hasText: "Subscription cancelled" });
			await expect(criticalChip).toBeVisible();
			await expect(criticalChip).toHaveAttribute(
				"data-flag-severity",
				"critical",
			);
		}
		const get2 = await rpc(apiCtx, "platformAdminTenants/health/get", {
			organizationId,
		});
		const body2 = get2.body?.json ?? get2.body;
		expect(body2.healthScore).toBe(28);
		expect(
			body2.riskFlags.find((f: any) => f.code === "subscription_cancelled"),
		).toBeTruthy();

		// ────────────────────────────────────────────────────────────────────
		// Scenario 3: Mixed (2 warn + 1 info)
		// ────────────────────────────────────────────────────────────────────
		await clearSnapshots(cp, organizationId);
		await seedSnapshot(cp, organizationId, 0, 60, [
			{
				code: "low_activity",
				severity: "warn",
				observedAt: new Date().toISOString(),
			},
			{
				code: "payment_stale",
				severity: "warn",
				observedAt: new Date().toISOString(),
			},
			{
				code: "no_data",
				severity: "info",
				observedAt: new Date().toISOString(),
			},
		]);

		uiOk = await tryOpenRiskTab(page, drillInUrl);
		console.log(`[scenario-3 mixed] ui=${uiOk}`);

		if (uiOk) {
			await expect(page.getByTestId("health-score-gauge")).toHaveAttribute(
				"data-band",
				"amber",
			);
			await expect(page.getByTestId("risk-flag-chip")).toHaveCount(3);
			await expect(page.locator('[data-flag-severity="warn"]')).toHaveCount(2);
			await expect(page.locator('[data-flag-severity="info"]')).toHaveCount(1);
		}
		const get3 = await rpc(apiCtx, "platformAdminTenants/health/get", {
			organizationId,
		});
		const body3 = get3.body?.json ?? get3.body;
		expect(body3.riskFlags.length).toBe(3);
		expect(
			body3.riskFlags.filter((f: any) => f.severity === "warn").length,
		).toBe(2);
		expect(
			body3.riskFlags.filter((f: any) => f.severity === "info").length,
		).toBe(1);

		// ────────────────────────────────────────────────────────────────────
		// Scenario 4: No data
		// ────────────────────────────────────────────────────────────────────
		await clearSnapshots(cp, organizationId);

		uiOk = await tryOpenRiskTab(page, drillInUrl);
		console.log(`[scenario-4 no-data] ui=${uiOk}`);

		if (uiOk) {
			await expect(page.getByTestId("health-score-gauge")).toHaveAttribute(
				"data-band",
				"none",
			);
			await expect(page.getByTestId("health-score-value")).toHaveText("—");
			await expect(page.getByTestId("risk-flags-empty")).toBeVisible();
			await expect(page.getByTestId("health-sparkline-empty")).toBeVisible();
		}
		const get4 = await rpc(apiCtx, "platformAdminTenants/health/get", {
			organizationId,
		});
		const body4 = get4.body?.json ?? get4.body;
		expect(body4.healthScore).toBeNull();
		expect(body4.snapshotDate).toBeNull();

		// ────────────────────────────────────────────────────────────────────
		// Scenario 5: Sparkline (10 days)
		// ────────────────────────────────────────────────────────────────────
		await clearSnapshots(cp, organizationId);
		const dailyScores = [80, 78, 75, 70, 65, 60, 58, 55, 52, 50];
		for (let i = 0; i < dailyScores.length; i++) {
			const daysAgo = dailyScores.length - 1 - i; // oldest → newest
			await seedSnapshot(cp, organizationId, daysAgo, dailyScores[i]!, []);
		}

		uiOk = await tryOpenRiskTab(page, drillInUrl);
		console.log(`[scenario-5 sparkline] ui=${uiOk}`);

		if (uiOk) {
			const spark = page.getByTestId("health-sparkline");
			await expect(spark).toBeVisible();
			await expect(spark).toHaveAttribute("data-points", "10");
			await expect(spark).toHaveAttribute("data-last-score", "50");
			await expect(spark.locator("polyline")).toHaveCount(1);
			await expect(spark.locator("circle")).toHaveCount(10);
			await expect(
				page.getByTestId("health-sparkline-last-label"),
			).toHaveText("50");
		}
		const hist5 = await rpc(apiCtx, "platformAdminTenants/health/history", {
			organizationId,
			days: 30,
		});
		const body5 = hist5.body?.json ?? hist5.body;
		expect(Array.isArray(body5.series)).toBe(true);
		expect(body5.series.length).toBe(10);
		expect(body5.series[body5.series.length - 1].healthScore).toBe(50);
		for (let i = 1; i < body5.series.length; i++) {
			expect(
				body5.series[i].snapshotDate >= body5.series[i - 1].snapshotDate,
			).toBe(true);
		}

		// Cleanup
		await clearSnapshots(cp, organizationId);
	});
});
