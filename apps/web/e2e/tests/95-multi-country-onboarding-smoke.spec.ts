/**
 * Plan B Phase 4.3 — Per-country Connect onboarding smoke.
 *
 * Verifies the multi-country onboarding flow from the UI side up through
 * redirect to Stripe OAuth. Stripe-hosted onboarding form fill is manual
 * (dynamic + captcha — same constraint as 98-connect-onboarding-smoke).
 *
 * Asserts:
 *   - /billing/connect renders without error
 *   - Existing MY account row visible (backfilled in Phase 4.1)
 *   - "Add country" button visible + enabled
 *   - AddCountryDialog opens
 *   - Country select lists SG as available (not yet linked)
 *   - Click "Connect Stripe" -> redirect to connect.stripe.com OAuth
 *   - OAuth URL includes:
 *       client_id=ca_...
 *       scope=read_write
 *       state=<base64url>     (HMAC-signed orgId.country.ts.sig)
 *       stripe_user[country]=SG (pre-fill on the Stripe form)
 *   - Screenshot of the Stripe-hosted onboarding form
 *
 * Prereqs (other terminals):
 *   T1: cd apps/server && make stripe-listen-platform
 *   T2: cd apps/server && make stripe-listen-connect
 *   T3: bun dev (repo root)
 *
 * Produces: test-results/.../video.webm + .png screenshot
 */

import { test, expect } from "@playwright/test";

test.use({ video: "on" });
test.setTimeout(120_000);

const ADMIN_EMAIL = "franchisee@gmail.com";
const ADMIN_PASSWORD = "password123";

test("Add country (SG) -> redirects to Stripe OAuth with country pre-fill", async ({
	page,
}) => {
	page.on("console", (msg) => {
		const txt = msg.text();
		if (
			msg.type() === "error" ||
			txt.includes("[connect]") ||
			txt.includes("[oauth]")
		) {
			console.log(`[browser.${msg.type()}] ${txt}`);
		}
	});
	page.on("response", async (res) => {
		const url = res.url();
		if (url.includes("/rpc/stripeConnect")) {
			const status = res.status();
			let body = "";
			try {
				body = (await res.text()).slice(0, 600);
			} catch {}
			console.log(`[rpc] ${status} ${url}\n  BODY: ${body}`);
		}
	});

	// ── 1. Login ──────────────────────────────────────────────
	await page.goto("/login");
	await page.fill('input[type="email"]', ADMIN_EMAIL);
	await page.fill('input[type="password"]', ADMIN_PASSWORD);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/(dashboard|customers|home|onboarding|subscribe)/, {
		timeout: 20_000,
	});
	console.log(`✓ Logged in + landed: ${page.url()}`);

	// ── 2. Navigate to /billing/connect ────────────────────────
	await page.goto("/billing/connect");
	await expect(
		page.getByRole("heading", { name: /payment processing/i }),
	).toBeVisible({ timeout: 15_000 });
	console.log(`✓ Billing Connect page loaded: ${page.url()}`);

	// ── 3. Existing MY card visible (backfilled in Phase 4.1) ─
	// The MY card renders as "Malaysia" with an "MY" chip + status badge.
	const malaysiaCard = page.getByText(/Malaysia/i).first();
	await expect(malaysiaCard).toBeVisible({ timeout: 10_000 });
	console.log("✓ Existing MY country row rendered (backfilled by Phase 4.1)");

	// ── 4. Click "Add country" ─────────────────────────────────
	const addButton = page.getByRole("button", { name: /add country/i });
	await expect(addButton).toBeVisible();
	await expect(addButton).toBeEnabled();
	await addButton.click();
	console.log("✓ Clicked Add country");

	// ── 5. Pick Singapore from the dialog select ──────────────
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible({ timeout: 5_000 });
	await expect(
		dialog.getByText(/Connect Stripe for a new country/i),
	).toBeVisible();

	// Open the Select (shadcn renders a button with the placeholder text).
	const selectTrigger = dialog.locator('[role="combobox"]').first();
	await selectTrigger.click();

	// shadcn SelectContent renders to a portal — find the SG option by visible
	// text. It should be in the form "Singapore (SGD)" per the supported list.
	await page.getByRole("option", { name: /Singapore.*SGD/i }).click();
	console.log("✓ Picked Singapore (SGD) from country select");

	// ── 6. Click Connect Stripe + assert redirect ─────────────
	const connectButton = dialog.getByRole("button", { name: /connect stripe/i });
	await expect(connectButton).toBeEnabled();

	await Promise.all([
		page.waitForURL(/connect\.stripe\.com/, { timeout: 30_000 }),
		connectButton.click(),
	]);
	const stripeUrl = page.url();
	console.log(`✓ Redirected to Stripe OAuth: ${stripeUrl}`);

	// ── 7. Verify OAuth URL shape ──────────────────────────────
	expect(stripeUrl).toContain("connect.stripe.com");
	expect(stripeUrl).toContain("client_id=ca_");
	expect(stripeUrl).toContain("scope=read_write");
	expect(stripeUrl).toMatch(/[?&]state=/);
	// Phase 4.3: stripe_user[country] is URL-encoded as stripe_user%5Bcountry%5D=SG
	expect(stripeUrl).toMatch(/stripe_user(\[country\]|%5Bcountry%5D)=SG/);
	console.log(
		"✓ OAuth URL includes client_id, scope=read_write, signed state, and country=SG",
	);

	// ── 8. Screenshot the Stripe-hosted page for the video ─────
	await page.waitForLoadState("domcontentloaded");
	await page.waitForTimeout(2500);
	await page.screenshot({
		path: "test-results/multi-country-onboarding-sg.png",
		fullPage: true,
	});
	console.log("✓ Stripe OAuth page screenshot captured");
});
