/**
 * Stripe SDK wrapper.
 *
 * Exports:
 * - getStripeClient(): shared Stripe client (lazy-init).
 * - verifyWebhookSignature(body, signature, source): verifies a webhook
 *   against the correct signing secret. `source` is 'platform' or 'connect'
 *   per ADR-0006.
 *
 * Env vars:
 * - STRIPE_SECRET_KEY                  Avantej platform secret (sk_test_… in sandbox)
 * - STRIPE_PLATFORM_WEBHOOK_SECRET     whsec_… for /webhooks/stripe/platform
 * - STRIPE_CONNECT_WEBHOOK_SECRET      whsec_… for /webhooks/stripe/connect
 *
 * Env access uses the same lazy require pattern as db.ts / email.ts /
 * auth.service.ts so the file is testable under bun (cloudflare:workers
 * is not resolvable in bun's test runner).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";

function getEnvVar(key: string): string | undefined {
	try {
		const { env } = require("cloudflare:workers") as {
			env: Record<string, string | undefined>;
		};
		const v = env[key];
		if (v !== undefined) return v;
	} catch {
		// Not in Cloudflare Workers runtime (bun test / Node).
	}
	const globalEnv = (globalThis as { env?: Record<string, string | undefined> }).env;
	if (globalEnv?.[key] !== undefined) return globalEnv[key];
	return process.env[key];
}

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
	if (!stripeClient) {
		const secretKey = getEnvVar("STRIPE_SECRET_KEY");
		if (!secretKey) {
			throw new Error("STRIPE_SECRET_KEY environment variable is not set");
		}
		stripeClient = new Stripe(secretKey, { apiVersion: "2025-10-29.clover" });
	}
	return stripeClient;
}

/**
 * Reset the cached Stripe client. Used by tests that mutate STRIPE_SECRET_KEY
 * between cases. Matches the __resetResendClient() pattern in email.ts.
 *
 * Production callers must not use this; module-level singleton is intentional
 * for request-scoped lifetime on Cloudflare Workers.
 */
export function __resetStripeClientForTesting(): void {
	stripeClient = null;
}

export type WebhookSource = "platform" | "connect";

export function verifyWebhookSignature(
	body: string,
	signature: string | null,
	source: WebhookSource,
): Stripe.Event {
	if (!signature) {
		throw new Error("Missing Stripe-Signature header");
	}

	const secret =
		source === "platform"
			? getEnvVar("STRIPE_PLATFORM_WEBHOOK_SECRET")
			: getEnvVar("STRIPE_CONNECT_WEBHOOK_SECRET");

	if (!secret) {
		throw new Error(
			source === "platform"
				? "STRIPE_PLATFORM_WEBHOOK_SECRET environment variable is not set"
				: "STRIPE_CONNECT_WEBHOOK_SECRET environment variable is not set",
		);
	}

	// Parse the Stripe-Signature header: t=<timestamp>,v1=<hmac>
	const parts: Record<string, string> = {};
	for (const part of signature.split(",")) {
		const eqIdx = part.indexOf("=");
		if (eqIdx !== -1) {
			parts[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
		}
	}

	const timestampStr = parts["t"];
	const v1 = parts["v1"];

	if (!timestampStr || !v1) {
		throw new Error("Invalid webhook signature: malformed header");
	}

	const timestamp = Number.parseInt(timestampStr, 10);
	const now = Math.floor(Date.now() / 1000);
	// Stripe's default tolerance is 300 seconds (5 minutes).
	if (Math.abs(now - timestamp) > 300) {
		throw new Error("Invalid webhook signature: timestamp outside tolerance");
	}

	const signed = `${timestampStr}.${body}`;
	const expected = createHmac("sha256", secret)
		.update(signed, "utf8")
		.digest("hex");

	let valid: boolean;
	try {
		valid = timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
	} catch {
		valid = false;
	}

	if (!valid) {
		throw new Error(
			"Invalid webhook signature: signature mismatch",
		);
	}

	// Signature is valid — parse the event payload.
	try {
		return JSON.parse(body) as Stripe.Event;
	} catch {
		throw new Error("Invalid webhook payload: not valid JSON");
	}
}
