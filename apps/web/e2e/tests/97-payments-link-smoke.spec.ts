/**
 * Plan B Phase 2 — Payment Link smoke (Direct Charge via Stripe Connect).
 *
 * Login as franchisee -> call payments.sendPaymentLink via oRPC -> assert
 * Stripe-hosted URL returned + appointment row updated with link_url.
 *
 * Skips UI navigation (calendar -> click appointment -> detail dialog) because
 * that path requires existing-appointment fixture-finding work; the oRPC
 * endpoint is the contract under test. UI manual-verified separately.
 *
 * Charge dialog (Stripe Elements iframe) is verified manually only — Playwright
 * cross-origin iframe interaction is brittle and not worth automating in v1.
 *
 * Prereqs (other terminals):
 *   T1: cd apps/server && make stripe-listen-platform
 *   T2: cd apps/server && make stripe-listen-connect
 *   T3: bun dev (repo root)
 *
 * Existing tenant DB must have at least one appointment with payment_status='pending'
 * and a non-null session_total. Run:
 *   psql "$TENANT_DATABASE_URL" -c "SELECT id FROM appointments WHERE payment_status='pending' LIMIT 1;"
 */

import { test, expect, type Page } from "@playwright/test";

test.use({ video: "on" });
test.setTimeout(120_000);

const ADMIN_EMAIL = "franchisee@gmail.com";
const ADMIN_PASSWORD = "password123";
const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

async function login(page: Page): Promise<void> {
	await page.goto("/login");
	await page.fill('input[type="email"]', ADMIN_EMAIL);
	await page.fill('input[type="password"]', ADMIN_PASSWORD);
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/(dashboard|customers|home|onboarding|subscribe)/, {
		timeout: 20_000,
	});
}

async function rpc<T>(
	page: Page,
	procedure: string,
	input: Record<string, unknown>,
): Promise<{ status: number; body: T | { json: { message?: string } } }> {
	const res = await page.evaluate(
		async ({ procedure, input }) => {
			const r = await fetch(`http://localhost:3000/rpc/${procedure}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ json: input }),
			});
			const text = await r.text();
			let parsed: unknown = text;
			try {
				parsed = JSON.parse(text);
			} catch {}
			return { status: r.status, body: parsed };
		},
		{ procedure, input },
	);
	return res as { status: number; body: T | { json: { message?: string } } };
}

test("payments.sendPaymentLink returns Stripe URL + persists on appointment", async ({
	page,
}) => {
	await login(page);
	console.log("✓ Logged in");

	// Use a known pending appointment from the seeded tenant DB.
	const appointmentId = "99666b58-bb8d-46a5-9627-860c17fbd684";
	console.log(`✓ Picked appointment: ${appointmentId}`);

	// sendPaymentLink.
	const linkRes = await rpc<{
		json: {
			paymentLinkUrl: string;
			amount: number;
			currency: string;
			applicationFeeAmount: number;
		};
	}>(page, "payments/sendPaymentLink", {
		organizationId: ORG_ID,
		appointmentId,
	});
	console.log(
		`[rpc] sendPaymentLink ${linkRes.status} ${JSON.stringify(linkRes.body).slice(0, 400)}`,
	);
	expect(linkRes.status).toBe(200);
	const link = (
		linkRes.body as {
			json: {
				paymentLinkUrl: string;
				amount: number;
				currency: string;
				applicationFeeAmount: number;
			};
		}
	).json;
	expect(link.paymentLinkUrl).toMatch(/^https:\/\/buy\.stripe\.com\//);
	expect(link.amount).toBeGreaterThan(0);
	expect(link.applicationFeeAmount).toBeGreaterThan(0);
	expect(link.applicationFeeAmount).toBeLessThan(link.amount);
	console.log(`✓ Payment Link generated: ${link.paymentLinkUrl}`);
	console.log(
		`  amount=${link.amount} ${link.currency} fee=${link.applicationFeeAmount}`,
	);

	// Verify persisted on appointment.
	const statusRes = await rpc<{
		json: {
			paymentStatus: string;
			paymentLinkUrl: string | null;
			applicationFeeAmount: number | null;
		};
	}>(page, "payments/getPaymentStatus", {
		organizationId: ORG_ID,
		appointmentId,
	});
	expect(statusRes.status).toBe(200);
	const stat = (
		statusRes.body as {
			json: {
				paymentStatus: string;
				paymentLinkUrl: string | null;
				applicationFeeAmount: number | null;
			};
		}
	).json;
	expect(stat.paymentLinkUrl).toBe(link.paymentLinkUrl);
	expect(stat.applicationFeeAmount).toBe(link.applicationFeeAmount);
	console.log(
		`✓ Persisted: status=${stat.paymentStatus} link=${stat.paymentLinkUrl}`,
	);

	// Visit the Payment Link so the video captures Stripe-hosted page.
	await page.goto(link.paymentLinkUrl);
	await page.waitForLoadState("domcontentloaded");
	await page.waitForTimeout(2000);
	await page.screenshot({
		path: "test-results/payments-link-stripe-hosted.png",
		fullPage: true,
	});
	console.log("✓ Stripe-hosted page screenshot captured");
});
