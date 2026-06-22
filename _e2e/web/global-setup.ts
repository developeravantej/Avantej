import { chromium, type Browser, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Multi-role Playwright global setup. Logs in ONCE per role and persists a
 * storageState per role so RBAC specs can pick a role via
 * `test.use({ storageState: "_e2e/.auth/staff.json" })`.
 *
 * - admin: franchisee@gmail.com (tenant admin) -> _e2e/.auth/admin.json (default)
 * - staff: staff.deterministic@test.com (role "staff", seeded by
 *   apps/server/scripts/seed-business-data.ts) -> _e2e/.auth/staff.json
 *
 * Mirrors e2e/auth.setup.ts: the app writes `current_organization_id` to
 * localStorage once useUserContext resolves — the reliable "authenticated" signal.
 * The staff login is best-effort: if the seeded user is absent, it logs a warning
 * and the staff RBAC specs skip rather than failing the whole run.
 */
const ROLES: Array<{
	name: string;
	email: string;
	password: string;
	required: boolean;
}> = [
	{
		name: "admin",
		email: process.env.E2E_EMAIL ?? "franchisee@gmail.com",
		password: process.env.E2E_PASSWORD ?? "password123",
		required: true,
	},
	{
		name: "staff",
		email: process.env.E2E_STAFF_EMAIL ?? "staff.deterministic@test.com",
		password: process.env.E2E_STAFF_PASSWORD ?? "password123",
		required: false,
	},
	{
		// Client-role login for the §3/4 client-portal specs (seed-customers.ts).
		name: "client",
		email: process.env.E2E_CLIENT_EMAIL ?? "sarah.lim@example.com",
		password: process.env.E2E_CLIENT_PASSWORD ?? "password123",
		required: false,
	},
	// Second-tenant (org B) owner — only when E2E_SECOND_TENANT=1 (a provisioned
	// org B exists). Captures _e2e/.auth/orgB-session.json for the isolation/saas
	// specs. Best-effort: skips if the login can't resolve org B.
	...(process.env.E2E_SECOND_TENANT === "1"
		? [
				{
					name: "orgB-session",
					email: process.env.E2E_ORGB_EMAIL ?? "developer.avantej@gmail.com",
					password: process.env.E2E_ORGB_PASSWORD ?? "password123",
					required: false,
				},
			]
		: []),
];

async function loginRole(
	browser: Browser,
	baseURL: string,
	role: { name: string; email: string; password: string },
): Promise<string | null> {
	// Isolated context per role — otherwise a prior role's cookies leak in and
	// /login auto-redirects to /dashboard (no form -> fill times out).
	const context = await browser.newContext({ baseURL });
	const page = await context.newPage();
	try {
		const form = page.locator("form").first();
		const emailField = form.getByRole("textbox", { name: /email/i });
		for (let attempt = 0; attempt < 4; attempt++) {
			await page
				.goto("/login", { waitUntil: "domcontentloaded" })
				.catch(() => {});
			const ok = await emailField
				.waitFor({ state: "visible", timeout: 20_000 })
				.then(() => true)
				.catch(() => false);
			if (ok) break;
			await page.waitForTimeout(2_000);
		}
		await emailField.fill(role.email);
		await form.locator('input[type="password"]').fill(role.password);
		await form.getByRole("button", { name: "Login", exact: true }).click();

		await page.waitForURL("**/dashboard**", { timeout: 25_000 });
		await page.waitForFunction(
			() => !!localStorage.getItem("current_organization_id"),
			{ timeout: 25_000, polling: 500 },
		);
		const orgId = await page.evaluate(() =>
			localStorage.getItem("current_organization_id"),
		);
		await context.storageState({ path: `_e2e/.auth/${role.name}.json` });
		return orgId;
	} finally {
		await context.close();
	}
}

export default async function globalSetup(config: FullConfig): Promise<void> {
	const baseURL =
		config.projects[0]?.use?.baseURL ??
		process.env.PLAYWRIGHT_BASE_URL ??
		"http://localhost:3021";
	mkdirSync("_e2e/.auth", { recursive: true });
	const browser = await chromium.launch();
	try {
		for (const role of ROLES) {
			try {
				const orgId = await loginRole(browser, baseURL, role);
				if (role.name === "admin" && orgId) {
					writeFileSync(
						"_e2e/.auth/org.json",
						JSON.stringify({ orgId }) + "\n",
					);
				}
				console.log(
					`[global-setup] ${role.name} session saved (org ${orgId ?? "?"})`,
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (role.required) throw err;
				console.warn(
					`[global-setup] optional role "${role.name}" login failed: ${msg}`,
				);
				console.warn(
					`[global-setup] -> staff RBAC specs will skip. Seed with: bun e2e:seed`,
				);
			}
		}
	} finally {
		await browser.close();
	}
}
