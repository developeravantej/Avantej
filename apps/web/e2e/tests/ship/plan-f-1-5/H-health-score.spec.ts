/**
 * Plan F.1.5 — Tenant health score + risk flags (Agent H).
 *
 * E2E coverage (API + DB):
 *   1. Seed a tenant_usage_snapshots row with healthScore=72 + a warn flag
 *      directly into the control-panel DB.
 *   2. `platformAdminTenants.health.get` returns the score + flags.
 *   3. `platformAdminTenants.health.history` returns ordered series.
 *   4. `platformAdminTenants.health.listAtRisk` returns the org sorted ASC
 *      with criticalFlagCount surfaced (we add a critical-flag seed too).
 *   5. RBAC negative — non-admin user gets FORBIDDEN on get + listAtRisk.
 *
 * Migration 0028 is applied inline via raw SQL (idempotent), mirroring
 * how Agents N + T landed 0026 / 0027. The dev control-panel DB's drizzle
 * journal stops at 18 (see VERIFICATION-N).
 */

import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { and, desc, eq, sql } from "drizzle-orm";
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

test.describe("@ship-f-1-5 Plan F.1.5 — Tenant Health Score", () => {
	test("health score: get / history / listAtRisk + RBAC", async ({
		page,
		context,
	}) => {
		test.setTimeout(120_000);

		const cp = getControlPanelDb();
		await ensureMigration0028(cp);

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
					`E2E_SUPER_ADMIN_EMAIL ${ENV_SUPER_ADMIN_EMAIL} not found`,
				);
			}
			adminEmail = ENV_SUPER_ADMIN_EMAIL;
			adminPassword = ENV_SUPER_ADMIN_PASSWORD;
			adminUserId = existing.id;
		} else {
			const suffix = `plan-f-1-5-h-${Date.now()}`;
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

		// Pick the target org.
		const orgRows = await cp
			.select({ id: organizations.id, name: organizations.name })
			.from(organizations)
			.limit(1);
		if (orgRows.length === 0)
			throw new Error("No organizations seeded in control-panel DB");
		const organizationId = orgRows[0]!.id;

		// ── Seed: today + 3 prior days of snapshots with health values ─────
		const today = new Date();
		const seeds = [
			{ daysAgo: 3, healthScore: 90, flags: [] as any[] },
			{ daysAgo: 2, healthScore: 80, flags: [] as any[] },
			{ daysAgo: 1, healthScore: 75, flags: [] as any[] },
			{
				daysAgo: 0,
				healthScore: 72,
				flags: [
					{
						code: "low_activity",
						severity: "warn",
						observedAt: today.toISOString(),
					},
					{
						code: "subscription_cancelled",
						severity: "critical",
						observedAt: today.toISOString(),
					},
				],
			},
		];

		for (const s of seeds) {
			const d = new Date(today.getTime() - s.daysAgo * 24 * 60 * 60 * 1000);
			await cp
				.insert(tenantUsageSnapshots)
				.values({
					organizationId,
					snapshotDate: isoDate(d),
					memberCount: 10,
					customerCount: 50,
					apptCount30d: 30,
					salesTotal30dMinor: 10_000_00,
					salesCurrency: "MYR",
					storageBytes: 0,
					ghlActive: false,
					healthScore: s.healthScore,
					riskFlags: s.flags,
				})
				.onConflictDoUpdate({
					target: [
						tenantUsageSnapshots.organizationId,
						tenantUsageSnapshots.snapshotDate,
					],
					set: {
						healthScore: s.healthScore,
						riskFlags: s.flags,
					},
				});
		}

		// ── Browser login + RPC context ────────────────────────────────────
		await loginAsAdmin(page, adminEmail, adminPassword);
		const apiCtx = context.request;

		// ── 1. get({ organizationId }) → latest snapshot's score + flags ───
		const getRes = await rpc(apiCtx, "platformAdminTenants/health/get", {
			organizationId,
		});
		expect(getRes.status, JSON.stringify(getRes.body)).toBe(200);
		const getBody = getRes.body?.json ?? getRes.body;
		expect(getBody.healthScore).toBe(72);
		expect(Array.isArray(getBody.riskFlags)).toBe(true);
		expect(
			getBody.riskFlags.find((f: any) => f.code === "low_activity"),
		).toBeTruthy();
		expect(
			getBody.riskFlags.find((f: any) => f.code === "subscription_cancelled"),
		).toBeTruthy();

		// ── 2. history({ days: 30 }) → ascending series ────────────────────
		const histRes = await rpc(apiCtx, "platformAdminTenants/health/history", {
			organizationId,
			days: 30,
		});
		expect(histRes.status, JSON.stringify(histRes.body)).toBe(200);
		const histBody = histRes.body?.json ?? histRes.body;
		expect(Array.isArray(histBody.series)).toBe(true);
		expect(histBody.series.length).toBeGreaterThanOrEqual(4);
		// Ordered ascending by date
		for (let i = 1; i < histBody.series.length; i++) {
			expect(
				histBody.series[i].snapshotDate >= histBody.series[i - 1].snapshotDate,
			).toBe(true);
		}
		// Last entry should be today's seed (72).
		expect(histBody.series[histBody.series.length - 1].healthScore).toBe(72);

		// ── 3. listAtRisk → org appears, sorted ascending by score ─────────
		const atRiskRes = await rpc(
			apiCtx,
			"platformAdminTenants/health/listAtRisk",
			{ limit: 10 },
		);
		expect(atRiskRes.status, JSON.stringify(atRiskRes.body)).toBe(200);
		const atRiskBody = atRiskRes.body?.json ?? atRiskRes.body;
		expect(Array.isArray(atRiskBody.orgs)).toBe(true);
		const hit = atRiskBody.orgs.find((o: any) => o.orgId === organizationId);
		expect(hit, "seeded org should appear in at-risk list").toBeTruthy();
		expect(hit.healthScore).toBe(72);
		expect(hit.criticalFlagCount).toBeGreaterThanOrEqual(1);
		// Ascending check across the result set
		for (let i = 1; i < atRiskBody.orgs.length; i++) {
			expect(
				(atRiskBody.orgs[i].healthScore ?? 0) >=
					(atRiskBody.orgs[i - 1].healthScore ?? 0),
			).toBe(true);
		}

		// ── 4. RBAC negative: non-admin gets FORBIDDEN ─────────────────────
		const userSuffix = `plan-f-1-5-h-user-${Date.now()}`;
		const userSigned = await signUpUser(userSuffix, "client");
		await cp
			.update(userTable)
			.set({ emailVerified: true })
			.where(eq(userTable.id, userSigned.userId));

		const userCtx = await page.context().browser()!.newContext();
		const userPage = await userCtx.newPage();
		await loginAsAdmin(userPage, userSigned.email, userSigned.password);
		const userApi = userCtx.request;

		const getDenied = await rpc(userApi, "platformAdminTenants/health/get", {
			organizationId,
		});
		expect(getDenied.status).toBeGreaterThanOrEqual(400);
		const denyStr = JSON.stringify(getDenied.body).toLowerCase();
		expect(denyStr.includes("forbidden") || denyStr.includes("admin")).toBe(
			true,
		);

		const listDenied = await rpc(
			userApi,
			"platformAdminTenants/health/listAtRisk",
			{ limit: 5 },
		);
		expect(listDenied.status).toBeGreaterThanOrEqual(400);

		await userCtx.close();

		// ── Cleanup (best-effort, not asserted) ────────────────────────────
		for (const s of seeds) {
			const d = new Date(today.getTime() - s.daysAgo * 24 * 60 * 60 * 1000);
			await cp
				.delete(tenantUsageSnapshots)
				.where(
					and(
						eq(tenantUsageSnapshots.organizationId, organizationId),
						eq(tenantUsageSnapshots.snapshotDate, isoDate(d)),
					),
				);
		}
	});
});
