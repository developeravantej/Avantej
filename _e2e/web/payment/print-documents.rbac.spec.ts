import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync } from "node:fs";
import { getOrgId, rpc, rpcRaw } from "../_safe-mutation";

/**
 * RBAC boundary for the branded print-documents feature — run as the seeded
 * NON-admin "staff" user (staff.deterministic@test.com).
 *
 * billingProfile.update / uploadLogo / removeLogo require
 * organization_settings:update (guards.ts requirePermissionOrpc), which the
 * staff role lacks — the server must return 403 specifically (a 401 would mean
 * the session never authenticated, i.e. a test passing for the wrong reason).
 * billingProfile.get is intentionally open to any org member (mirrors the
 * organizationSettings.get pattern) — asserting it succeeds also proves the
 * staff session is live, making the 403s meaningful. Skips gracefully when the
 * staff session is absent.
 */
const STAFF_STATE = "_e2e/.auth/staff.json";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

test.describe("print documents (RBAC — staff)", () => {
	let staff: APIRequestContext;

	test.beforeAll(async ({ playwright }) => {
		test.skip(
			!existsSync(STAFF_STATE),
			"no staff session — run `bun e2e:seed` then re-run",
		);
		staff = await playwright.request.newContext({
			baseURL: BASE,
			storageState: STAFF_STATE,
		});
	});
	test.afterAll(async () => {
		await staff?.dispose();
	});

	test("Staff CAN read the billing profile (member-open read, proves live session)", async () => {
		const organizationId = getOrgId();
		// rpc() asserts res.ok() — a null body (never-configured profile) is fine.
		await rpc(staff, "billingProfile/get", { organizationId });
	});

	test("Staff is FORBIDDEN (403, not 401) from updating the billing identity", async () => {
		const organizationId = getOrgId();
		const res = await rpcRaw(staff, "billingProfile/update", {
			organizationId,
			legalName: "E2E-DEEP-staff-should-not-write",
		});
		expect(
			res.status(),
			"organization_settings:update gate must be FORBIDDEN for staff",
		).toBe(403);
	});

	test("Staff is FORBIDDEN (403) from uploading a document logo", async () => {
		const organizationId = getOrgId();
		const res = await rpcRaw(staff, "billingProfile/uploadLogo", {
			organizationId,
			contentType: "image/png",
			// 1x1 png — never reaches R2; the permission gate runs first.
			data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		});
		expect(res.status()).toBe(403);
	});

	test("Staff is FORBIDDEN (403) from removing the document logo", async () => {
		const organizationId = getOrgId();
		const res = await rpcRaw(staff, "billingProfile/removeLogo", {
			organizationId,
		});
		expect(res.status()).toBe(403);
	});

	test("Anonymous caller is rejected outright on billingProfile.update", async ({
		playwright,
	}) => {
		// ⚠️ Inside @playwright/test, request.newContext() INHERITS the config's
		// use.storageState (admin) unless overridden — an "anonymous" context made
		// without this override authenticates as admin and the write SUCCEEDS.
		// Pass an explicitly empty state so the call is genuinely unauthenticated.
		const anon = await playwright.request.newContext({
			baseURL: BASE,
			storageState: { cookies: [], origins: [] },
		});
		try {
			const res = await anon.post("/rpc/billingProfile/update", {
				data: { json: { organizationId: getOrgId(), legalName: "x" } },
			});
			expect(res.status(), "unauthenticated -> 401").toBe(401);
		} finally {
			await anon.dispose();
		}
	});
});

// UI layer (recorded): the API tests above are APIRequestContext-only and
// produce no browser context, hence no video. This test opens a real page as
// staff so the RBAC boundary has visual proof. Invariant: staff can NEVER
// reach an ENABLED "Save Billing Identity" control — either the route guard
// (hierarchy_management:update) bounces them to /dashboard, or the page
// renders with the admin-gated control disabled. Both outcomes satisfy the
// invariant; an enabled control fails it.
test.describe("print documents (RBAC — staff UI)", () => {
	test.skip(!existsSync(STAFF_STATE), "no staff session");
	test.use({ storageState: STAFF_STATE });

	test("Staff never reaches an enabled Save Billing Identity control", async ({
		page,
	}) => {
		await page.goto("/dashboard/settings/organization");
		const redirected = await page
			.waitForURL((u) => !u.pathname.includes("settings/organization"), {
				timeout: 10_000,
			})
			.then(() => true)
			.catch(() => false);

		if (redirected) {
			// Route guard fired — staff lacks the settings route permission.
			expect(page.url()).toContain("/dashboard");
			return;
		}
		// Page rendered — the card's admin gate must hold: the save control is
		// disabled (or the whole card withheld) for a non-admin member.
		await expect(page.getByText("Billing Identity").first()).toBeVisible({
			timeout: 20_000,
		});
		const save = page.getByRole("button", { name: /save billing identity/i });
		await expect(save).toBeVisible({ timeout: 20_000 });
		await expect(save).toBeDisabled();
	});
});
