import { test, expect, request as pwRequest } from "@playwright/test";
import { expectForbidden, rpc, rpcRaw } from "../_safe-mutation";

/**
 * Platform-admin RBAC — doubles as a TENANT-ISOLATION regression
 * (complements _e2e/web/multi-tenant/): a tenant user must never cross into
 * the control-panel privileged surface.
 *
 * Layers asserted:
 *   1. API boundary — franchisee@gmail.com (tenant admin, NOT a platform admin)
 *      gets FORBIDDEN on every platform-admin procedure (requirePlatformAdmin →
 *      403). admin/me stays callable but reports isPlatformAdmin:false.
 *   2. Route guard — /dashboard/platform-admin/admins and /payments beforeLoad
 *      redirect the tenant user back to /dashboard (defence-in-depth).
 *   3. Unauthenticated — no session at all → UNAUTHORIZED (401).
 *
 * Uses the default franchisee storageState (_e2e/.auth/admin.json) captured by
 * global-setup. Auth cookies are scoped to localhost:3021 — do not drive
 * avantej.localhost here.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

// Read-or-write procedures behind requirePlatformAdmin — all must reject the
// tenant session. Inputs satisfy zod so the rejection is authz, not validation.
const GUARDED_CALLS: Array<[string, unknown]> = [
	["admin/listAdmins", {}],
	["admin/listUsers", { page: 1, limit: 10 }],
	["admin/grantPlatformAdmin", { userId: "e2e-rbac-probe", role: "support" }],
	["admin/revokePlatformAdmin", { userId: "e2e-rbac-probe" }],
	["platformAdminPayments/overview", {}],
	["platformAdminPayments/listDrift", { limit: 10 }],
	["platformAdminPayments/runReconciliationNow", {}],
	["platformAdminPayments/runWebhookBackfillNow", {}],
];

test.describe("platform-admin RBAC — tenant user is walled off (API boundary)", () => {
	test("every platform-admin procedure rejects the tenant session with 401/403", async ({
		page,
	}) => {
		for (const [proc, input] of GUARDED_CALLS) {
			await expectForbidden(page.request, proc, input);
		}
	});

	test("admin/me is safe for any authenticated user and reports non-admin truthfully", async ({
		page,
	}) => {
		// me is intentionally NOT behind requirePlatformAdmin — the router relies
		// on it for the route guards. It must answer 200 with the non-admin shape.
		const me = await rpc(page.request, "admin/me", {});
		expect(me).toMatchObject({ isPlatformAdmin: false, role: null });
	});
});

test.describe("platform-admin RBAC — route-level guard (tenant user in browser)", () => {
	test("visiting /dashboard/platform-admin/admins bounces back to /dashboard", async ({
		page,
	}) => {
		await page.goto("/dashboard/platform-admin/admins", {
			waitUntil: "domcontentloaded",
		});
		// beforeLoad calls admin/me and throws redirect({ to: "/dashboard" }).
		await page.waitForURL((url) => !url.pathname.includes("platform-admin"), {
			timeout: 30_000,
		});
		expect(page.url()).not.toContain("platform-admin");
		// The privileged page content never rendered.
		await expect(
			page.getByText("Manage platform admin accounts", { exact: false }),
		).toHaveCount(0);
	});

	test("visiting /dashboard/platform-admin/payments bounces back to /dashboard", async ({
		page,
	}) => {
		await page.goto("/dashboard/platform-admin/payments", {
			waitUntil: "domcontentloaded",
		});
		await page.waitForURL((url) => !url.pathname.includes("platform-admin"), {
			timeout: 30_000,
		});
		expect(page.url()).not.toContain("platform-admin");
		await expect(page.getByText("Payment Integrity")).toHaveCount(0);
	});
});

test.describe("platform-admin RBAC — unauthenticated", () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test("no session at all is rejected with 401 on the same surface", async () => {
		const anon = await pwRequest.newContext({ baseURL: BASE });
		try {
			for (const [proc, input] of [
				["admin/listAdmins", {}],
				["platformAdminPayments/overview", {}],
				["platformAdminPayments/runReconciliationNow", {}],
			] as Array<[string, unknown]>) {
				const res = await rpcRaw(anon, proc, input);
				expect(
					res.status(),
					`anonymous /rpc/${proc} must be UNAUTHORIZED`,
				).toBe(401);
			}
		} finally {
			await anon.dispose();
		}
	});
});
