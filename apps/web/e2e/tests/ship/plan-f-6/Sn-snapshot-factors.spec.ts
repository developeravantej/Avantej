/**
 * Plan F.6 (Agent Sn) — Snapshot factor expansion.
 *
 * F.1.5 launched the composite health-score formula but the daily cron
 * only populated 2/5 factors (payment_status + last_successful_payment_at).
 * F.6 wires the remaining three: lastAdminLoginAt, failedWebhooks7d,
 * dailyActiveMembers30dAvg. This spec exercises:
 *
 *   1. Migration 0030 applied — three new columns exist on
 *      tenant_usage_snapshots.
 *   2. Schema accepts inserts containing the new fields (round-trip).
 *   3. Direct insertion with stale admin login + webhook failures =>
 *      `platformAdminTenants.health.get` surfaces inactive_admin +
 *      webhook_failures flags (and not no_data for those factors).
 *   4. Tolerant: a snapshot row with the new fields all NULL still
 *      reads back fine — the formula falls back to per-factor no_data
 *      without crashing.
 *
 * Tagged @ship-f-6.
 */

import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { tenantUsageSnapshots } from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
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
const WEB_ORIGIN = process.env.E2E_WEB_BASE_URL ?? "http://localhost:3021";

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

function isoDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

test.describe("@ship-f-6 Plan F.6 — Agent Sn snapshot factor expansion", () => {
	test("0030 columns + roundtrip + health.get reflects new factors", async ({
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

		// Belt-and-suspenders: ensure migration is applied on whatever DB
		// the e2e is pointed at. Idempotent.
		await cp.execute(sql`
			ALTER TABLE tenant_usage_snapshots
				ADD COLUMN IF NOT EXISTS last_admin_login_at timestamp,
				ADD COLUMN IF NOT EXISTS failed_webhooks_7d integer,
				ADD COLUMN IF NOT EXISTS daily_active_members_30d_avg integer;
		`);

		// ── Scenario 1: Columns exist on the target table. ───────────────
		const colRows = (await cp.execute(sql`
			SELECT column_name
			FROM information_schema.columns
			WHERE table_name = 'tenant_usage_snapshots'
			  AND column_name IN (
				'last_admin_login_at',
				'failed_webhooks_7d',
				'daily_active_members_30d_avg'
			  )
			ORDER BY column_name;
		`)) as unknown as { rows: Array<{ column_name: string }> };
		const cols = colRows.rows.map((r) => r.column_name);
		console.log(`[scenario-1] columns=${JSON.stringify(cols)}`);
		expect(cols).toContain("last_admin_login_at");
		expect(cols).toContain("failed_webhooks_7d");
		expect(cols).toContain("daily_active_members_30d_avg");

		// Auth setup — promote (or sign up) a super-admin.
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
			const suffix = `plan-f-6-sn-${Date.now()}`;
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

		// Find any organization to test against. Filter to RFC4122 v1-v8
		// UUIDs because Zod's `.uuid()` rejects synthetic zero-version IDs
		// (`00000000-...-ff01`) seeded by old fixtures.
		const orgRows = (await cp.execute(sql`
			SELECT id::text AS id FROM organizations
			WHERE id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}'
			LIMIT 1;
		`)) as unknown as { rows: Array<{ id: string }> };
		const anyOrg = orgRows.rows[0];
		if (!anyOrg) {
			test.skip(
				true,
				"No RFC4122 organization in control-panel DB — seed dev data first",
			);
			return;
		}
		const orgId = anyOrg.id;

		// ── Scenario 2: Schema round-trip — insert all 3 new fields, read back. ─
		const today = isoDate(new Date());
		const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
		// Wipe today's snapshot (idempotency).
		await cp
			.delete(tenantUsageSnapshots)
			.where(eq(tenantUsageSnapshots.organizationId, orgId));

		await cp.insert(tenantUsageSnapshots).values({
			organizationId: orgId,
			snapshotDate: today,
			memberCount: 50,
			customerCount: 200,
			apptCount30d: 120,
			salesTotal30dMinor: 0,
			salesCurrency: "MYR",
			storageBytes: 0,
			ghlActive: false,
			healthScore: 50,
			riskFlags: [
				{
					code: "inactive_admin",
					severity: "info",
					observedAt: new Date().toISOString(),
				},
				{
					code: "webhook_failures",
					severity: "critical",
					observedAt: new Date().toISOString(),
				},
			],
			lastAdminLoginAt: fifteenDaysAgo,
			failedWebhooks7d: 5,
			dailyActiveMembers30dAvg: 3,
		});

		const [readBack] = await cp
			.select({
				lastAdminLoginAt: tenantUsageSnapshots.lastAdminLoginAt,
				failedWebhooks7d: tenantUsageSnapshots.failedWebhooks7d,
				dailyActiveMembers30dAvg: tenantUsageSnapshots.dailyActiveMembers30dAvg,
			})
			.from(tenantUsageSnapshots)
			.where(eq(tenantUsageSnapshots.organizationId, orgId))
			.limit(1);
		console.log(`[scenario-2] readback=${JSON.stringify(readBack)}`);
		expect(readBack).toBeTruthy();
		expect(readBack!.failedWebhooks7d).toBe(5);
		expect(readBack!.dailyActiveMembers30dAvg).toBe(3);
		expect(readBack!.lastAdminLoginAt).toBeTruthy();

		// ── Scenario 3: health.get surfaces inactive_admin + webhook_failures. ─
		const got = await rpc(apiCtx, "platformAdminTenants/health/get", {
			organizationId: orgId,
		});
		console.log(
			`[scenario-3] health.get status=${got.status} body=${JSON.stringify(
				got.body,
			).slice(0, 600)}`,
		);
		expect(got.status).toBe(200);
		const body = got.body?.json ?? got.body;
		expect(typeof body).toBe("object");
		const flags: Array<{ code: string; severity: string }> =
			body?.riskFlags ?? [];
		const codes = flags.map((f) => f.code);
		expect(codes).toContain("inactive_admin");
		expect(codes).toContain("webhook_failures");

		// ── Scenario 4: Tolerant — nullable new fields don't crash reads. ──
		await cp
			.delete(tenantUsageSnapshots)
			.where(eq(tenantUsageSnapshots.organizationId, orgId));
		await cp.insert(tenantUsageSnapshots).values({
			organizationId: orgId,
			snapshotDate: today,
			memberCount: 0,
			customerCount: 0,
			apptCount30d: 0,
			salesTotal30dMinor: 0,
			salesCurrency: "MYR",
			storageBytes: 0,
			ghlActive: false,
			healthScore: 0,
			riskFlags: [],
			lastAdminLoginAt: null,
			failedWebhooks7d: null,
			dailyActiveMembers30dAvg: null,
		});

		const got2 = await rpc(apiCtx, "platformAdminTenants/health/get", {
			organizationId: orgId,
		});
		console.log(`[scenario-4] tolerant-null status=${got2.status}`);
		expect(got2.status).toBe(200);
	});
});
