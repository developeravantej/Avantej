/**
 * Plan A — /subscribe end-to-end smoke test.
 *
 * Login as pre-seeded franchisee → /subscribe → click Professional →
 * Stripe Checkout → fill test card 4242 → return → /dashboard.
 *
 * Produces: test-results/.../video.webm
 *
 * Prereqs (must be running in other terminals):
 *   T1: cd apps/server && make stripe-listen-platform
 *   T2: bun dev (from repo root)
 */

import { test, expect } from "@playwright/test";

test.use({ video: "on" });
test.setTimeout(180_000);

const ADMIN_EMAIL = "franchisee@gmail.com";
const ADMIN_PASSWORD = "password123";

test("subscribe → Stripe Checkout → webhook → dashboard", async ({ page }) => {
	// Capture browser console + network for diagnostic.
	page.on("console", (msg) => {
		if (msg.type() === "error" || msg.type() === "warning") {
			console.log(`[browser ${msg.type()}] ${msg.text()}`);
		}
	});
	page.on("requestfailed", (req) => {
		console.log(`[req failed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
	});
	page.on("response", async (res) => {
		const url = res.url();
		if (url.includes("/rpc/subscriptions") || url.includes("/rpc/auth/userContext")) {
			const status = res.status();
			let body = "";
			try { body = (await res.text()).slice(0, 800); } catch {}
			console.log(`[rpc] ${status} ${url}\n  BODY: ${body}\n`);
		}
	});
	page.on("console", (msg) => {
		const txt = msg.text();
		console.log(`[browser.${msg.type()}] ${txt}`);
	});

	// ── 1. Login ──────────────────────────────────────────────
	await page.goto("/login");
	await page.fill('input[type="email"]', ADMIN_EMAIL);
	await page.fill('input[type="password"]', ADMIN_PASSWORD);
	await page.click('button[type="submit"]');
	await page.waitForURL(
		/\/(dashboard|customers|home|onboarding|subscribe)/,
		{ timeout: 20_000 },
	);
	console.log(`✓ Logged in + landed: ${page.url()}`);

	// ── 2. Navigate to /subscribe ──────────────────────────────
	await page.goto("/subscribe");
	await page.waitForLoadState("networkidle");
	console.log(`Subscribe page: ${page.url()}`);

	await expect(
		page.getByRole("heading", { name: /choose your plan/i }),
	).toBeVisible({ timeout: 15_000 });

	// ── 3. Click Professional plan ─────────────────────────────
	const professionalButton = page.getByRole("button", {
		name: /subscribe to professional/i,
	});
	await expect(professionalButton).toBeVisible();

	// userContext (currentOrganizationId) may still be loading. Give it a beat.
	await page.waitForTimeout(2500);

	// Debug: read currentOrganizationId from React state if available.
	const ls = await page.evaluate(() =>
		localStorage.getItem("current_organization_id"),
	);
	console.log(`localStorage.current_organization_id = ${ls}`);

	await Promise.all([
		page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 }),
		professionalButton.click(),
	]);
	console.log("✓ Redirected to Stripe Checkout");

	// ── 4. Fill Stripe Checkout ────────────────────────────────
	const cardNumber = page.locator(
		'input[name="cardNumber"], input[autocomplete="cc-number"]',
	);
	await cardNumber.waitFor({ timeout: 30_000 });
	await cardNumber.fill("4242 4242 4242 4242");

	await page
		.locator('input[name="cardExpiry"], input[autocomplete="cc-exp"]')
		.fill("12 / 34");

	await page
		.locator('input[name="cardCvc"], input[autocomplete="cc-csc"]')
		.fill("123");

	const cardName = page.locator(
		'input[name="billingName"], input[autocomplete="cc-name"]',
	);
	if (await cardName.count()) {
		await cardName.first().fill("Avantej Dev Tester");
	}

	const billingZip = page.locator(
		'input[name="billingPostalCode"], input[autocomplete="postal-code"]',
	);
	if (await billingZip.count()) {
		await billingZip.first().fill("94103");
	}

	const submitButton = page
		.locator(
			'button:has-text("Subscribe"), button:has-text("Pay"), button[type="submit"]',
		)
		.first();
	await submitButton.click();
	console.log("✓ Submitted Stripe Checkout");

	// ── 5. Return → /dashboard ─────────────────────────────────
	await page.waitForURL(/\/subscribe\?session_id=cs_/, { timeout: 30_000 });
	console.log("✓ Returned to /subscribe with session_id");

	await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
	console.log("✓ Reached /dashboard");

	await expect(page).toHaveURL(/\/dashboard/);
});
