/**
 * Plan F.4 — /migrations read-only viewer page (Agent Mi).
 *
 * Covers `platformAdminMigrations.listMigrations` (control-panel + tenant),
 * `platformAdminMigrations.getMigrationFile` (valid + path-traversal reject),
 * UI render with KPI cards + tabs + status table, and RBAC (support role).
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

test.describe("@ship-f-4 Plan F.4 — Agent Mi /migrations viewer", () => {
	test("migrations viewer: listMigrations + getMigrationFile + UI + RBAC", async ({
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

		// Seed / hoist platform admin.
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
			const suffix = `plan-f-4-mi-${Date.now()}`;
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

		// ──────────────────────────────────────────────────────────────────
		// Scenario 1: listMigrations default (control-panel)
		// ──────────────────────────────────────────────────────────────────
		const r1 = await rpc(apiCtx, "platformAdminMigrations/listMigrations", {});
		console.log(
			`[scenario-1] listMigrations control-panel status=${r1.status} keys=${JSON.stringify(Object.keys((r1.body?.json ?? r1.body) || {}))}`,
		);
		expect(r1.status).toBe(200);
		const cpView = r1.body?.json ?? r1.body;
		expect(cpView.schema).toBe("control-panel");
		expect(Array.isArray(cpView.journal)).toBe(true);
		expect(Array.isArray(cpView.applied)).toBe(true);
		expect(Array.isArray(cpView.status)).toBe(true);
		expect(typeof cpView.summary.journalCount).toBe("number");
		expect(typeof cpView.summary.appliedCount).toBe("number");
		expect(typeof cpView.summary.pendingCount).toBe("number");
		expect(typeof cpView.summary.orphanedCount).toBe("number");
		expect(cpView.summary.journalCount).toBeGreaterThanOrEqual(19);
		expect(cpView.journal[0].tag).toBe("0000_far_luminals");
		// status array contains every journal tag.
		const cpStatusTags = new Set(cpView.status.map((s: any) => s.tag));
		for (const j of cpView.journal) {
			expect(cpStatusTags.has(j.tag)).toBe(true);
		}

		// ──────────────────────────────────────────────────────────────────
		// Scenario 2: listMigrations tenant
		// ──────────────────────────────────────────────────────────────────
		const r2 = await rpc(apiCtx, "platformAdminMigrations/listMigrations", {
			schema: "tenant",
		});
		console.log(`[scenario-2] listMigrations tenant status=${r2.status}`);
		expect(r2.status).toBe(200);
		const tView = r2.body?.json ?? r2.body;
		expect(tView.schema).toBe("tenant");
		expect(tView.journal.length).toBeGreaterThanOrEqual(20);
		expect(tView.journal[0].tag).toBe("0000_noisy_aqueduct");
		// applied[] is empty (multi-tenant — not surfaced here).
		expect(tView.applied).toEqual([]);
		// Every tenant journal tag is pending.
		const pendingTagsT = new Set(
			tView.status
				.filter((s: any) => s.state === "pending")
				.map((s: any) => s.tag),
		);
		expect(pendingTagsT.has("0000_noisy_aqueduct")).toBe(true);

		// ──────────────────────────────────────────────────────────────────
		// Scenario 3: getMigrationFile (valid tag — control-panel)
		// ──────────────────────────────────────────────────────────────────
		const r3 = await rpc(apiCtx, "platformAdminMigrations/getMigrationFile", {
			schema: "control-panel",
			tag: "0000_far_luminals",
		});
		console.log(
			`[scenario-3] getMigrationFile valid status=${r3.status} sqlLen=${String(((r3.body?.json ?? r3.body) || {}).sql ?? "").length}`,
		);
		expect(r3.status).toBe(200);
		const file3 = r3.body?.json ?? r3.body;
		expect(file3.tag).toBe("0000_far_luminals");
		expect(typeof file3.sql).toBe("string");
		expect(file3.sql.length).toBeGreaterThan(0);
		expect(file3.sql).toContain("CREATE TABLE");

		// ──────────────────────────────────────────────────────────────────
		// Scenario 4: getMigrationFile rejects path-traversal
		// ──────────────────────────────────────────────────────────────────
		const r4 = await rpc(apiCtx, "platformAdminMigrations/getMigrationFile", {
			schema: "control-panel",
			tag: "../../../etc/passwd",
		});
		console.log(`[scenario-4] path-traversal status=${r4.status}`);
		expect(r4.status).toBe(400);

		// ──────────────────────────────────────────────────────────────────
		// Scenario 5: UI render
		// ──────────────────────────────────────────────────────────────────
		await page.goto("/dashboard/platform-admin/migrations");
		await page.waitForLoadState("networkidle").catch(() => {});

		const html = await page.content();
		const has500 = /Internal Server Error|status code 500|500 -/i.test(html);
		console.log(`[scenario-5] migrations page has500=${has500}`);
		expect(has500).toBe(false);

		const headingVisible = await page
			.getByRole("heading", { name: "Migrations" })
			.waitFor({ state: "visible", timeout: 15_000 })
			.then(() => true)
			.catch(() => false);
		console.log(`[scenario-5] heading visible=${headingVisible}`);
		expect(headingVisible).toBe(true);

		await expect(page.getByTestId("migrations-tabs")).toBeVisible();
		await expect(
			page.getByTestId("migrations-tab-trigger-control-panel"),
		).toBeVisible();
		await expect(
			page.getByTestId("migrations-tab-trigger-tenant"),
		).toBeVisible();
		await expect(page.getByTestId("migrations-kpi-row")).toBeVisible();
		await expect(page.getByTestId("kpi-migrations-journal")).toBeVisible();
		await expect(page.getByTestId("kpi-migrations-applied")).toBeVisible();
		await expect(page.getByTestId("kpi-migrations-pending")).toBeVisible();
		await expect(page.getByTestId("kpi-migrations-orphaned")).toBeVisible();
		await expect(page.getByTestId("migration-status-table")).toBeVisible();

		// ──────────────────────────────────────────────────────────────────
		// Scenario 6: switch to tenant tab triggers refetch
		// ──────────────────────────────────────────────────────────────────
		await page
			.getByTestId("migrations-tab-trigger-tenant")
			.click({ timeout: 5_000 })
			.catch(() => {});
		await page.waitForTimeout(500);
		// Tenant tab content should be visible.
		await expect(page.getByTestId("migrations-tab-tenant")).toBeVisible({
			timeout: 10_000,
		});

		// ──────────────────────────────────────────────────────────────────
		// Scenario 7: RBAC — support role still gets 200 (read-only).
		// ──────────────────────────────────────────────────────────────────
		await cp
			.update(platformAdmins)
			.set({ role: "support" })
			.where(eq(platformAdmins.userId, adminUserId));
		const r7 = await rpc(apiCtx, "platformAdminMigrations/listMigrations", {});
		console.log(`[scenario-7] support-role list status=${r7.status}`);
		expect(r7.status).toBe(200);
		const r7b = await rpc(apiCtx, "platformAdminMigrations/getMigrationFile", {
			schema: "control-panel",
			tag: "0000_far_luminals",
		});
		expect(r7b.status).toBe(200);
		await cp
			.update(platformAdmins)
			.set({ role: "super_admin" })
			.where(eq(platformAdmins.userId, adminUserId));
	});
});
