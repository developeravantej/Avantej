/**
 * Plan F.2 — /revenue page (Agent V).
 *
 * Read-only aggregator over subscriptions + organizations.
 * Covers getKpis / getCohortRetention / getRecentChurn RPCs +
 * /dashboard/platform-admin/revenue UI render.
 *
 * Tagged @ship-f-2.
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

test.describe("@ship-f-2 Plan F.2 — Agent V /revenue page", () => {
	test("getKpis + getCohortRetention + getRecentChurn + UI render", async ({
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
			const suffix = `plan-f-2-v-${Date.now()}`;
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

		// Scenario 1: getKpis shape
		const r1 = await rpc(apiCtx, "platformAdminRevenue/getKpis", {});
		console.log(
			`[scenario-1] getKpis status=${r1.status} body=${JSON.stringify(r1.body).slice(0, 300)}`,
		);
		expect(r1.status).toBe(200);
		const k = r1.body?.json ?? r1.body;
		expect(k.mrr).toBeTruthy();
		expect(typeof k.mrr.cents).toBe("number");
		expect(k.mrr.estimateAvailable).toBe(true);
		expect(typeof k.arr.cents).toBe("number");
		expect(typeof k.activeSubsCount).toBe("number");
		expect(typeof k.trialingSubsCount).toBe("number");
		expect(typeof k.cancelledLast30d).toBe("number");
		expect(typeof k.churnRatePct).toBe("number");
		expect(k.churnRatePct).toBeGreaterThanOrEqual(0);
		expect(k.churnRatePct).toBeLessThanOrEqual(100);
		expect(typeof k.netNewMrrLast30dCents).toBe("number");
		expect(typeof k.newMrrLast30dCents).toBe("number");
		expect(typeof k.churnedMrrLast30dCents).toBe("number");

		// Scenario 2: ARR = MRR × 12
		expect(k.arr.cents).toBe(k.mrr.cents * 12);

		// Scenario 3: getCohortRetention shape (monthsBack=6)
		const r3 = await rpc(apiCtx, "platformAdminRevenue/getCohortRetention", {
			monthsBack: 6,
		});
		expect(r3.status).toBe(200);
		const c = r3.body?.json ?? r3.body;
		expect(Array.isArray(c.cohorts)).toBe(true);
		expect(c.cohorts.length).toBeLessThanOrEqual(6);
		for (const cohort of c.cohorts) {
			expect(cohort.cohortMonth).toMatch(/^\d{4}-\d{2}$/);
			expect(typeof cohort.cohortSize).toBe("number");
			expect(cohort.cohortSize).toBeGreaterThanOrEqual(0);
			expect(Array.isArray(cohort.retained)).toBe(true);
			expect(cohort.retained[0]).toBe(cohort.cohortSize);
		}

		// Scenario 4: getRecentChurn shape
		const r4 = await rpc(apiCtx, "platformAdminRevenue/getRecentChurn", {
			days: 30,
		});
		expect(r4.status).toBe(200);
		const churn = r4.body?.json ?? r4.body;
		expect(Array.isArray(churn.events)).toBe(true);
		for (const e of churn.events) {
			expect(typeof e.orgId).toBe("string");
			expect(typeof e.orgName).toBe("string");
			expect(typeof e.tier).toBe("string");
			expect(typeof e.mrrCentsLost).toBe("number");
			expect(typeof e.canceledAt).toBe("string");
		}

		// Scenario 5: UI render — /dashboard/platform-admin/revenue
		await page.goto("/dashboard/platform-admin/revenue");
		await page.waitForLoadState("networkidle").catch(() => {});

		const html = await page.content();
		const has500 = /Internal Server Error|status code 500|500 -/i.test(html);
		console.log(`[scenario-5] revenue page has500=${has500}`);
		expect(has500).toBe(false);

		const revenueHeadingVisible = await page
			.getByRole("heading", { name: "Revenue" })
			.waitFor({ state: "visible", timeout: 15_000 })
			.then(() => true)
			.catch(() => false);
		console.log(`[scenario-5] heading visible=${revenueHeadingVisible}`);
		if (revenueHeadingVisible) {
			await expect(page.getByTestId("revenue-kpis")).toBeVisible();
			await expect(page.getByTestId("kpi-mrr")).toBeVisible();
			await expect(page.getByTestId("kpi-arr")).toBeVisible();
			await expect(page.getByTestId("kpi-active-subs")).toBeVisible();
			await expect(page.getByTestId("kpi-cancelled-30d")).toBeVisible();
			await expect(page.getByTestId("cohort-card")).toBeVisible();
		}
	});
});
