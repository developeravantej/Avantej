/**
 * Journey: Stripe Connect webhook — signature verification accepts valid, rejects tampered
 *
 * Actor: Stripe (server-to-server) — no auth/session needed; the endpoint trusts
 *        the HMAC signature, not a cookie.
 * Priority: P1
 *
 * The connect webhook (POST /webhooks/stripe/connect, webhooks.routes.ts:213) verifies
 * the `stripe-signature` header against STRIPE_CONNECT_WEBHOOK_SECRET via
 * stripe.webhooks.constructEventAsync (lib/stripe.ts:91). A valid signature is
 * accepted (2xx) and a `payment_intent.succeeded` event records a ledger row; a
 * missing or tampered signature is rejected with 400 + "Invalid signature".
 *
 * This builds a Stripe-scheme signature ourselves:
 *   sig = HMAC_SHA256(secret, `${timestamp}.${rawBody}`)
 *   header = `t=${timestamp},v1=${sig}`
 *
 * Skips cleanly if STRIPE_CONNECT_WEBHOOK_SECRET isn't present in apps/server/.dev.vars.
 *
 * Run: bunx playwright test e2e/pos-stripe-webhook.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const SERVER_URL = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:3020";
const WEBHOOK_PATH = "/webhooks/stripe/connect";

function readDevVar(key: string): string | null {
	try {
		const file = readFileSync(
			path.join(process.cwd(), "apps/server/.dev.vars"),
			"utf8",
		);
		const line = file.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
		return line ? line.slice(key.length + 1).trim() : null;
	} catch {
		return null;
	}
}

function stripeSignature(
	rawBody: string,
	secret: string,
	timestamp: number,
): string {
	const sig = createHmac("sha256", secret)
		.update(`${timestamp}.${rawBody}`)
		.digest("hex");
	return `t=${timestamp},v1=${sig}`;
}

test("Stripe connect webhook accepts a validly-signed event and rejects a tampered one", {
	tag: ["@p1"],
}, async ({ request }) => {
	const secret = readDevVar("STRIPE_CONNECT_WEBHOOK_SECRET");
	test.skip(!secret, "STRIPE_CONNECT_WEBHOOK_SECRET not set — skip");

	// A minimal but well-formed payment_intent.succeeded event.
	const event = {
		id: `evt_e2e_${Date.now()}`,
		object: "event",
		api_version: "2024-06-20",
		created: Math.floor(Date.now() / 1000),
		type: "payment_intent.succeeded",
		account: "acct_test_e2e_seed",
		data: {
			object: {
				id: `pi_e2e_${Date.now()}`,
				object: "payment_intent",
				amount: 6000,
				amount_received: 6000,
				currency: "myr",
				status: "succeeded",
				metadata: { organizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee" },
			},
		},
	};
	const rawBody = JSON.stringify(event);
	const ts = Math.floor(Date.now() / 1000);

	// ── 1. Valid signature → accepted (2xx) ────────────────────────────────────
	const validResp = await request.post(`${SERVER_URL}${WEBHOOK_PATH}`, {
		headers: {
			"content-type": "application/json",
			"stripe-signature": stripeSignature(rawBody, secret!, ts),
		},
		data: rawBody,
	});
	expect(
		validResp.ok(),
		`Valid-signature webhook should be accepted; got ${validResp.status()} ${await validResp.text()}`,
	).toBeTruthy();

	// ── 2. Tampered body (signature no longer matches) → rejected 400 ──────────
	const tamperedResp = await request.post(`${SERVER_URL}${WEBHOOK_PATH}`, {
		headers: {
			"content-type": "application/json",
			"stripe-signature": stripeSignature(rawBody, secret!, ts),
		},
		data: rawBody.replace('"amount":6000', '"amount":999999'),
	});
	expect(tamperedResp.status()).toBe(400);

	// ── 3. Missing signature header → rejected 400 ─────────────────────────────
	const noSigResp = await request.post(`${SERVER_URL}${WEBHOOK_PATH}`, {
		headers: { "content-type": "application/json" },
		data: rawBody,
	});
	expect(noSigResp.status()).toBe(400);
});
