/**
 * Plan F.3.5 — Global Billing (Agent G).
 *
 * E2E coverage:
 *   1. getOverview RPC shape — super_admin call returns kpis + recentInvoices
 *      + recentRefunds + activeCoupons. Tolerant of missing Stripe key.
 *   2. listInvoicesCrossTenant RPC shape — default args produce a well-formed
 *      response.
 *   3. UI render — /dashboard/platform-admin/billing mounts heading + 4 KPI
 *      cards + 3 tabs.
 *   4. Tab switching — clicking each tab reveals its content.
 *   5. Org-link navigation — if a recentInvoice/refund row is present, click
 *      the org link and assert URL change.
 *   6. RBAC — support-role admin gets 200 on getOverview (read-only). The
 *      Coupons tab does NOT show a "New coupon" button for support.
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

async function ensurePlatformAdmin(
	cp: ReturnType<typeof getControlPanelDb>,
	userId: string,
	role: "super_admin" | "support" | "billing",
) {
	const existing = await cp
		.select({ id: platformAdmins.id, role: platformAdmins.role })
		.from(platformAdmins)
		.where(eq(platformAdmins.userId, userId));
	if (existing.length === 0) {
		await cp.insert(platformAdmins).values({ userId, role });
	} else if (existing[0]!.role !== role) {
		await cp
			.update(platformAdmins)
			.set({ role })
			.where(eq(platformAdmins.userId, userId));
	}
}

test.describe("@ship-f-3-5 Plan F.3.5 — Global Billing (Agent G)", () => {
	test("global billing: getOverview/listInvoicesCrossTenant/UI/tabs/RBAC", async ({
		page,
		context,
	}) => {
		test.setTimeout(120_000);

		const cp = getControlPanelDb();

		// ── Setup super-admin ───────────────────────────────────────────────
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
			const suffix = `plan-f-3-5-g-${Date.now()}`;
			const signed = await signUpUser(suffix, "admin");
			adminEmail = signed.email;
			adminPassword = signed.password;
			adminUserId = signed.userId;
		}
		await cp
			.update(userTable)
			.set({ emailVerified: true })
			.where(eq(userTable.id, adminUserId));
		await ensurePlatformAdmin(cp, adminUserId, "super_admin");

		// ── Login ───────────────────────────────────────────────────────────
		await loginAsAdmin(page, adminEmail, adminPassword);
		const apiCtx = context.request;

		// ── 1. getOverview RPC shape ────────────────────────────────────────
		const overviewRes = await rpc(
			apiCtx,
			"platformAdminBilling/getOverview",
			{},
		);
		expect(overviewRes.status).toBe(200);
		const overview = overviewRes.body?.json ?? overviewRes.body;
		expect(typeof overview.kpis).toBe("object");
		expect(typeof overview.kpis.activeSubsCount).toBe("number");
		expect(typeof overview.kpis.mrr.cents).toBe("number");
		expect(typeof overview.kpis.refundsLast30dCount).toBe("number");
		expect(typeof overview.kpis.refundsLast30dAmountCents).toBe("number");
		expect(typeof overview.kpis.couponsCount).toBe("number");
		expect(Array.isArray(overview.recentInvoices)).toBe(true);
		expect(Array.isArray(overview.recentRefunds)).toBe(true);
		expect(Array.isArray(overview.activeCoupons)).toBe(true);
		expect(typeof overview.stripeAvailable).toBe("boolean");

		// ── 2. listInvoicesCrossTenant RPC shape ────────────────────────────
		const listRes = await rpc(
			apiCtx,
			"platformAdminBilling/listInvoicesCrossTenant",
			{ limit: 50, days: 30 },
		);
		expect(listRes.status).toBe(200);
		const listBody = listRes.body?.json ?? listRes.body;
		expect(Array.isArray(listBody.invoices)).toBe(true);
		expect(typeof listBody.stripeAvailable).toBe("boolean");

		// ── 3. UI render ────────────────────────────────────────────────────
		await page.goto("/dashboard/platform-admin/billing");
		await page.waitForLoadState("networkidle");

		await expect(page.getByTestId("billing-global-page")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();

		// KPI cards (wait for query → kpi-row to render).
		await expect(page.getByTestId("billing-kpi-row")).toBeVisible({
			timeout: 15_000,
		});
		await expect(page.getByTestId("kpi-active-subs")).toBeVisible();
		await expect(page.getByTestId("kpi-mrr")).toBeVisible();
		await expect(page.getByTestId("kpi-refunds")).toBeVisible();
		await expect(page.getByTestId("kpi-coupons")).toBeVisible();

		// Tabs.
		await expect(page.getByTestId("billing-tabs-list")).toBeVisible();
		await expect(page.getByTestId("billing-tab-invoices")).toBeVisible();
		await expect(page.getByTestId("billing-tab-refunds")).toBeVisible();
		await expect(page.getByTestId("billing-tab-coupons")).toBeVisible();

		// ── 4. Tab switching ────────────────────────────────────────────────
		// Default tab = invoices. Either the panel or the empty-state must be
		// present.
		const invoicesVisible = await page
			.getByTestId("recent-invoices-panel")
			.isVisible({ timeout: 2_000 })
			.catch(() => false);
		const invoicesEmpty = await page
			.getByTestId("recent-invoices-empty")
			.isVisible({ timeout: 2_000 })
			.catch(() => false);
		expect(invoicesVisible || invoicesEmpty).toBe(true);

		await page.getByTestId("billing-tab-refunds").click();
		const refundsVisible = await page
			.getByTestId("refund-queue-panel")
			.isVisible({ timeout: 5_000 })
			.catch(() => false);
		const refundsEmpty = await page
			.getByTestId("refund-queue-empty")
			.isVisible({ timeout: 5_000 })
			.catch(() => false);
		expect(refundsVisible || refundsEmpty).toBe(true);

		await page.getByTestId("billing-tab-coupons").click();
		await expect(page.getByTestId("coupon-list-panel")).toBeVisible({
			timeout: 5_000,
		});

		// Super-admin should see the "New coupon" button.
		await expect(page.getByTestId("coupon-create-btn")).toBeVisible();

		// ── 5. Org-link navigation (best-effort) ────────────────────────────
		// Switch back to invoices and try to click any org link. If no rows in
		// dev env, skip; the URL-change assertion only runs when there's data.
		await page.getByTestId("billing-tab-invoices").click();
		if (invoicesVisible) {
			const firstLink = page
				.locator('[data-testid^="recent-invoice-org-link-"]')
				.first();
			if (await firstLink.isVisible({ timeout: 1_500 }).catch(() => false)) {
				await firstLink.click();
				await page.waitForURL(/\/dashboard\/platform-admin\/tenants\//, {
					timeout: 10_000,
				});
				await expect(page).toHaveURL(/\/dashboard\/platform-admin\/tenants\//);
				await page.goBack();
				await page.waitForLoadState("networkidle");
			}
		}

		// ── 6. RBAC: support role can read but not see create button ────────
		await cp
			.update(platformAdmins)
			.set({ role: "support" })
			.where(eq(platformAdmins.userId, adminUserId));

		const supportOverview = await rpc(
			apiCtx,
			"platformAdminBilling/getOverview",
			{},
		);
		expect(supportOverview.status).toBe(200);

		// Reload UI as support — Coupons tab should not expose "New coupon".
		await page.goto("/dashboard/platform-admin/billing");
		await page.waitForLoadState("networkidle");
		await page.getByTestId("billing-tab-coupons").click();
		await expect(page.getByTestId("coupon-list-panel")).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByTestId("coupon-create-btn")).toHaveCount(0);

		// Restore role.
		await cp
			.update(platformAdmins)
			.set({ role: "super_admin" })
			.where(eq(platformAdmins.userId, adminUserId));
	});
});
