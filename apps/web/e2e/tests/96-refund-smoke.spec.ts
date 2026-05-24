/**
 * Plan B Phase 3b — Refund smoke (Direct Charge via Stripe Connect).
 *
 * Login as franchisee -> verify the target appointment is paid via
 * payments.getPaymentStatus -> if paid, call payments.refund and assert
 * a refundId is returned. If the appointment is NOT paid (tenant DB drift),
 * SKIP the test with a clear message — refund testing requires a paid
 * appointment fixture, which Phase 2 verified manually.
 *
 * Webhook propagation (charge.refunded flipping payment_status -> "refunded")
 * is verified manually — not polled here.
 *
 * Prereqs (other terminals):
 *   T1: cd apps/server && make stripe-listen-platform
 *   T2: cd apps/server && make stripe-listen-connect
 *   T3: bun dev (repo root)
 */

import { test, expect, type Page } from "@playwright/test";

test.use({ video: "on" });
test.setTimeout(120_000);

const ADMIN_EMAIL = "franchisee@gmail.com";
const ADMIN_PASSWORD = "password123";
const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const APPOINTMENT_ID = "99666b58-bb8d-46a5-9627-860c17fbd684";

async function login(page: Page): Promise<void> {
	await page.goto("/login");
	await page.fill('input[type="email"]', ADMIN_EMAIL);
	await page.fill('input[type="password"]', ADMIN_PASSWORD);
	await page.click('button[type="submit"]');
	await page.waitForURL(
		/\/(dashboard|customers|home|onboarding|subscribe)/,
		{ timeout: 20_000 },
	);
}

async function rpc<T>(
	page: Page,
	procedure: string,
	input: Record<string, unknown>,
): Promise<{ status: number; body: T | { json: { message?: string } } }> {
	const res = await page.evaluate(
		async ({ procedure, input }) => {
			const r = await fetch(`/rpc/${procedure}`, {
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

test("payments.refund issues a Stripe refund on a paid appointment", async ({ page }) => {
	await login(page);
	console.log("✓ Logged in");

	// Pre-condition: check the appointment is paid. If not, skip (no failure).
	const statusRes = await rpc<{
		json: { paymentStatus: string; stripePaymentIntentId: string | null };
	}>(page, "payments/getPaymentStatus", {
		organizationId: ORG_ID,
		appointmentId: APPOINTMENT_ID,
	});
	console.log(
		`[rpc] getPaymentStatus ${statusRes.status} ${JSON.stringify(statusRes.body).slice(0, 300)}`,
	);
	expect(statusRes.status).toBe(200);
	const stat = (
		statusRes.body as {
			json: { paymentStatus: string; stripePaymentIntentId: string | null };
		}
	).json;

	if (stat.paymentStatus !== "paid") {
		console.log(
			`⊘ SKIP: appointment ${APPOINTMENT_ID} is "${stat.paymentStatus}", not "paid". ` +
				"Refund smoke requires a paid appointment fixture — Phase 2 verified this " +
				"path manually. Pay the appointment via Stripe test card to enable this test.",
		);
		test.skip(
			true,
			`Appointment ${APPOINTMENT_ID} is "${stat.paymentStatus}" — paid fixture required for refund smoke`,
		);
		return;
	}
	expect(stat.stripePaymentIntentId).toBeTruthy();
	console.log(`✓ Pre-condition met: paid, PI=${stat.stripePaymentIntentId}`);

	// Issue refund.
	const refundRes = await rpc<{
		json: { refundId: string; status: string; amount: number; currency: string };
	}>(page, "payments/refund", {
		organizationId: ORG_ID,
		appointmentId: APPOINTMENT_ID,
	});
	console.log(
		`[rpc] refund ${refundRes.status} ${JSON.stringify(refundRes.body).slice(0, 400)}`,
	);
	expect(refundRes.status).toBe(200);
	const refund = (
		refundRes.body as {
			json: { refundId: string; status: string; amount: number; currency: string };
		}
	).json;
	// Standard accounts return pyr_ (Payouts Reversal); Custom/platform-direct
	// refunds return re_. Accept both — what matters is a Stripe object id.
	expect(refund.refundId).toMatch(/^(re_|pyr_)/);
	expect(refund.amount).toBeGreaterThan(0);
	expect(["pending", "succeeded", "requires_action"]).toContain(refund.status);
	console.log(
		`✓ Refund issued: ${refund.refundId} status=${refund.status} amount=${refund.amount} ${refund.currency}`,
	);
});
