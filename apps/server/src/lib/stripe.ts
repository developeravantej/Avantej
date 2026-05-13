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

	const stripe = getStripeClient();
	try {
		return stripe.webhooks.constructEvent(body, signature, secret);
	} catch (error) {
		if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
			throw new Error(`Invalid webhook signature: ${error.message}`);
		}
		throw new Error(
			`Webhook signature verification failed: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
		);
	}
}
