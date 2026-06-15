/**
 * Plan B Phase 1 — Stripe Connect onboarding smoke (partial).
 *
 * Verifies:
 *   - Login as pre-seeded franchisee.
 *   - Navigate /billing/connect.
 *   - Click "Connect Stripe" -> server creates Express account + AccountLink.
 *   - Browser redirects to connect.stripe.com hosted onboarding.
 *   - Screenshot taken on Stripe page (proof).
 *
 * Does NOT fill the Express onboarding form (dynamic + captcha). Manual
 * follow-through or Stripe test-helper API needed to drive account.updated
 * webhook + flip charges_enabled.
 *
 * Prereqs (other terminals):
 *   T1: cd apps/server && make stripe-listen-platform
 *   T2: cd apps/server && make stripe-listen-connect
 *   T3: bun dev (repo root)
 *
 * Produces: test-results/.../video.webm
 */

import { test, expect } from "@playwright/test";

test.use({ video: "on" });
test.setTimeout(120_000);

const ADMIN_EMAIL = "franchisee@gmail.com";
const ADMIN_PASSWORD = "password123";

test("connect Stripe -> redirects to connect.stripe.com onboarding", async ({
	page,
}) => {
	page.on("console", (msg) => {
		const txt = msg.text();
		if (
			msg.type() === "error" ||
			msg.type() === "warning" ||
			txt.includes("[checkout]") ||
			txt.includes("[connect]")
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
				body = (await res.text()).slice(0, 800);
			} catch {}
			console.log(`[rpc] ${status} ${url}\n  BODY: ${body}\n`);
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

	// Give userContext + getAccountStatus a beat.
	await page.waitForTimeout(2500);

	// ── 3. Click "Connect Stripe" -> Stripe Express onboarding ─
	const connectButton = page.getByRole("button", {
		name: /connect stripe|continue onboarding/i,
	});
	await expect(connectButton).toBeVisible();

	await Promise.all([
		page.waitForURL(/connect\.stripe\.com/, { timeout: 30_000 }),
		connectButton.click(),
	]);
	console.log(`✓ Redirected to Stripe Connect onboarding: ${page.url()}`);

	// ── 4. Screenshot proof of Stripe-hosted page ──────────────
	// Wait for any heading/text the page renders (varies by Stripe locale).
	await page.waitForLoadState("domcontentloaded");
	await page.waitForTimeout(2500);
	await page.screenshot({
		path: "test-results/connect-stripe-onboarding.png",
		fullPage: true,
	});
	console.log("✓ Screenshot captured");

	// ── 5. Assert URL stays on Stripe (no redirect-loop bug) ───
	await expect(page).toHaveURL(/connect\.stripe\.com/);
});
