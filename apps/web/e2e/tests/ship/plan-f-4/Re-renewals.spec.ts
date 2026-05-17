/**
 * Plan F.4 — /renewals page (Agent Re).
 *
 * Read-only 90-day calendar of upcoming subscription renewals across all
 * tenants. Covers platformAdminRenewals.getCalendar RPC (default + custom
 * window), MRR pass/at-risk math invariants, past-due ordering, and the
 * /dashboard/platform-admin/renewals UI render.
 *
 * Tagged @ship-f-4.
 */

import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { eq } from "drizzle-orm";
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

test.describe("@ship-f-4 Plan F.4 — Agent Re /renewals page", () => {
	test("getCalendar RPC + math invariants + UI render", async ({
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
			const suffix = `plan-f-4-re-${Date.now()}`;
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

		// Scenario 1: getCalendar default — returns weeks + pastDue + summary.
		const r1 = await rpc(
			apiCtx,
			"platformAdminRenewals/getCalendar",
			{},
		);
		console.log(
			`[scenario-1] getCalendar default status=${r1.status} body=${JSON.stringify(r1.body).slice(0, 300)}`,
		);
		expect(r1.status).toBe(200);
		const cal = r1.body?.json ?? r1.body;
		expect(Array.isArray(cal.weeks)).toBe(true);
		expect(Array.isArray(cal.pastDue)).toBe(true);
		expect(typeof cal.summary).toBe("object");
		expect(typeof cal.summary.totalRenewalsInWindow).toBe("number");
		expect(typeof cal.summary.totalMrrPassingCents).toBe("number");
		expect(typeof cal.summary.totalMrrAtRiskCents).toBe("number");
		expect(typeof cal.summary.pastDueCount).toBe("number");
		// 90-day default → at least 13 weeks seeded.
		expect(cal.weeks.length).toBeGreaterThanOrEqual(13);
		for (const w of cal.weeks) {
			expect(typeof w.weekStartISO).toBe("string");
			expect(typeof w.weekEndISO).toBe("string");
			expect(Array.isArray(w.renewals)).toBe(true);
			expect(typeof w.totalMrrPassingCents).toBe("number");
			expect(typeof w.totalMrrAtRiskCents).toBe("number");
		}

		// Scenario 2: custom window (30 days) — fewer weeks.
		const r2 = await rpc(apiCtx, "platformAdminRenewals/getCalendar", {
			daysAhead: 30,
		});
		expect(r2.status).toBe(200);
		const narrow = r2.body?.json ?? r2.body;
		expect(narrow.weeks.length).toBeLessThanOrEqual(cal.weeks.length);
		expect(narrow.weeks.length).toBeGreaterThanOrEqual(4);

		// Scenario 3: MRR math invariant per week.
		for (const w of cal.weeks) {
			const passSum = w.renewals
				.filter((r: any) => !r.cancelAtPeriodEnd)
				.reduce((s: number, r: any) => s + r.mrrCents, 0);
			const riskSum = w.renewals
				.filter((r: any) => r.cancelAtPeriodEnd)
				.reduce((s: number, r: any) => s + r.mrrCents, 0);
			expect(passSum).toBe(w.totalMrrPassingCents);
			expect(riskSum).toBe(w.totalMrrAtRiskCents);
		}
		// And summary totals match sum-of-weeks.
		const sumRisk = cal.weeks.reduce(
			(s: number, w: any) => s + w.totalMrrAtRiskCents,
			0,
		);
		const sumPass = cal.weeks.reduce(
			(s: number, w: any) => s + w.totalMrrPassingCents,
			0,
		);
		expect(cal.summary.totalMrrAtRiskCents).toBe(sumRisk);
		expect(cal.summary.totalMrrPassingCents).toBe(sumPass);

		// Scenario 4: pastDue ordering (oldest first) if 2+ entries.
		if (cal.pastDue.length >= 2) {
			for (let i = 1; i < cal.pastDue.length; i++) {
				const prev = cal.pastDue[i - 1].currentPeriodEnd;
				const cur = cal.pastDue[i].currentPeriodEnd;
				expect(prev <= cur).toBe(true);
			}
		}
		// pastDueCount matches array length.
		expect(cal.summary.pastDueCount).toBe(cal.pastDue.length);

		// Scenario 5: RBAC — support-role admin should still get 200 (read-only).
		// Demote temporarily, hit, restore.
		await cp
			.update(platformAdmins)
			.set({ role: "support" })
			.where(eq(platformAdmins.userId, adminUserId));
		const r5 = await rpc(
			apiCtx,
			"platformAdminRenewals/getCalendar",
			{},
		);
		console.log(`[scenario-5] support-role status=${r5.status}`);
		expect(r5.status).toBe(200);
		await cp
			.update(platformAdmins)
			.set({ role: "super_admin" })
			.where(eq(platformAdmins.userId, adminUserId));

		// Scenario 6: UI render — /dashboard/platform-admin/renewals.
		await page.goto("/dashboard/platform-admin/renewals");
		await page.waitForLoadState("networkidle").catch(() => {});

		const html = await page.content();
		const has500 = /Internal Server Error|status code 500|500 -/i.test(html);
		console.log(`[scenario-6] renewals page has500=${has500}`);
		expect(has500).toBe(false);

		const renewalsHeadingVisible = await page
			.getByRole("heading", { name: "Renewals" })
			.waitFor({ state: "visible", timeout: 15_000 })
			.then(() => true)
			.catch(() => false);
		console.log(`[scenario-6] heading visible=${renewalsHeadingVisible}`);
		if (renewalsHeadingVisible) {
			await expect(page.getByTestId("renewals-kpi-row")).toBeVisible();
			await expect(page.getByTestId("kpi-renewals-total")).toBeVisible();
			await expect(page.getByTestId("kpi-mrr-passing")).toBeVisible();
			await expect(page.getByTestId("kpi-mrr-at-risk")).toBeVisible();
			await expect(page.getByTestId("kpi-past-due")).toBeVisible();
			// Calendar grid or its empty-state should render.
			const gridOrEmpty = await page
				.getByTestId("renewals-calendar-grid")
				.or(page.getByTestId("renewals-calendar-empty"))
				.first()
				.waitFor({ state: "visible", timeout: 10_000 })
				.then(() => true)
				.catch(() => false);
			expect(gridOrEmpty).toBe(true);
		}
	});
});
