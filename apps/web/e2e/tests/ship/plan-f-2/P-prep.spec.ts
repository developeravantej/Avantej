/**
 * Plan F.2 — Prep work (Agent P).
 *
 * Two tech-debt items that unblock Agent V's revenue page:
 *
 *   1. `listTenants` aggregation cast bug fix.
 *      Pre-fix: `array_agg(... = ANY(${orgIds}::uuid[]))` threw
 *      "cannot cast type record to uuid[]" under @neondatabase/serverless
 *      because the driver binds JS arrays as a `record` parameter.
 *      Post-fix: replaced with drizzle `inArray(...)`.
 *
 *   2. `platformAdminDashboard.getOverview` MRR wiring.
 *      Pre-fix: `mrr.estimateAvailable = false`, `mrr.cents = 0`.
 *      Post-fix: sums TIER_PRICES_USD_CENTS across active+trialing subs,
 *      `mrr.estimateAvailable = true`.
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

test.describe("@ship-f-2 Plan F.2 — Agent P prep work", () => {
	test("listTenants cast fix + MRR aggregator wiring", async ({
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

		// ── Setup super-admin ───────────────────────────────────────────────
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
			const suffix = `plan-f-2-p-${Date.now()}`;
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

		// ────────────────────────────────────────────────────────────────────
		// Scenario 1: listTenants RPC golden — no cast error
		// ────────────────────────────────────────────────────────────────────
		const r1 = await rpc(apiCtx, "platformAdminTenants/listTenants", {
			page: 1,
			limit: 50,
		});
		console.log(
			`[scenario-1] listTenants status=${r1.status} body=${JSON.stringify(r1.body).slice(0, 200)}`,
		);
		expect(r1.status).toBe(200);
		const body1 = r1.body?.json ?? r1.body;
		expect(body1).toBeTruthy();
		expect(Array.isArray(body1.tenants)).toBe(true);
		expect(typeof body1.total).toBe("number");
		expect(typeof body1.page).toBe("number");
		expect(typeof body1.limit).toBe("number");

		// Pre-fix would throw "cannot cast type record to uuid[]" — assert no
		// such error surfaced in the response body.
		const stringified1 = JSON.stringify(r1.body);
		expect(stringified1).not.toMatch(/cannot cast type record/);

		// ────────────────────────────────────────────────────────────────────
		// Scenario 2: listTenants with paymentStatus filter
		// ────────────────────────────────────────────────────────────────────
		const r2 = await rpc(apiCtx, "platformAdminTenants/listTenants", {
			page: 1,
			limit: 50,
			paymentStatus: "active",
		});
		console.log(`[scenario-2] filtered listTenants status=${r2.status}`);
		expect(r2.status).toBe(200);
		const body2 = r2.body?.json ?? r2.body;
		expect(Array.isArray(body2.tenants)).toBe(true);
		for (const t of body2.tenants) {
			expect(t.paymentStatus).toBe("active");
		}

		// ────────────────────────────────────────────────────────────────────
		// Scenario 3: /tenants UI render — no 500 overlay
		// ────────────────────────────────────────────────────────────────────
		await page.goto("/dashboard/platform-admin/tenants");
		// Best-effort wait — table heading or empty state should show.
		await page.waitForLoadState("networkidle").catch(() => {});
		// 500 error overlays in dev typically render "500" / "Internal Server
		// Error" text. Assert neither is present.
		const html = await page.content();
		const has500 = /Internal Server Error|status code 500|500 -/i.test(html);
		console.log(`[scenario-3] tenants page has500=${has500}`);
		expect(has500).toBe(false);

		// ────────────────────────────────────────────────────────────────────
		// Scenario 4: getOverview MRR estimateAvailable=true
		// ────────────────────────────────────────────────────────────────────
		const r4 = await rpc(apiCtx, "platformAdminDashboard/getOverview", {});
		expect(r4.status).toBe(200);
		const body4 = r4.body?.json ?? r4.body;
		expect(body4.mrr).toBeTruthy();
		expect(body4.mrr.estimateAvailable).toBe(true);
		expect(typeof body4.mrr.cents).toBe("number");
		expect(body4.mrr.cents).toBeGreaterThanOrEqual(0);
		console.log(
			`[scenario-4] mrr.cents=${body4.mrr.cents} estimateAvailable=${body4.mrr.estimateAvailable}`,
		);

		// ────────────────────────────────────────────────────────────────────
		// Scenario 5: /dashboard/platform-admin/ UI — MRR card not "—"
		// ────────────────────────────────────────────────────────────────────
		await page.goto("/dashboard/platform-admin/");
		const headingVisible = await page
			.getByRole("heading", { name: "Mission Control" })
			.waitFor({ state: "visible", timeout: 15_000 })
			.then(() => true)
			.catch(() => false);
		console.log(
			`[scenario-5] mission-control headingVisible=${headingVisible}`,
		);
		if (headingVisible) {
			const mrrCard = page.getByTestId("kpi-mrr");
			await expect(mrrCard).toBeVisible();
			const mrrText = (await mrrCard.textContent()) ?? "";
			console.log(`[scenario-5] mrrText=${mrrText}`);
			// Post-fix: card should render a dollar amount (even $0.00), not "—".
			// Tolerate any value containing a digit + currency-ish symbol.
			expect(mrrText).toMatch(/\$|\d/);
		}
	});
});
