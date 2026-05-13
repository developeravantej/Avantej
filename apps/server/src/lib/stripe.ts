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
 */

import Stripe from "stripe";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Get environment variable from Cloudflare Workers env or process.env (for Node.js/test environments)
 */
function getEnvVar(key: string): string | undefined {
	try {
		const { env } = require("cloudflare:workers") as { env: Record<string, string | undefined> };
		return env[key];
	} catch {
		// Not in Cloudflare Workers environment (e.g., in tests)
	}
	// Fall back to globalThis.env (used in bun tests via stub) then process.env
	const globalEnv = (globalThis as unknown as { env?: Record<string, string | undefined> }).env;
	if (globalEnv?.[key] !== undefined) {
		return globalEnv[key];
	}
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

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Verify a Stripe webhook signature using node:crypto directly.
 *
 * Stripe's SDK uses SubtleCryptoProvider in web/CF environments which is
 * async-only and cannot be used in sync `constructEvent`. We implement the
 * same algorithm (HMAC-SHA256 over "<t>.<payload>") using node:crypto so that
 * verification works synchronously in all environments (bun, CF Workers with
 * node:crypto compatibility, Node.js).
 *
 * Stripe signature header format: t=<unix_ts>,v1=<hex_sig>[,v1=<hex_sig>...]
 * Spec: https://docs.stripe.com/webhooks/signatures
 */
function verifyStripeSignatureHeader(
	payload: string,
	header: string,
	secret: string,
): void {
	const parts = header.split(",");
	let timestamp = -1;
	const signatures: string[] = [];

	for (const part of parts) {
		const eqIdx = part.indexOf("=");
		if (eqIdx === -1) continue;
		const key = part.slice(0, eqIdx);
		const value = part.slice(eqIdx + 1);
		if (key === "t") {
			timestamp = parseInt(value, 10);
		} else if (key === "v1") {
			signatures.push(value);
		}
	}

	if (timestamp === -1 || signatures.length === 0) {
		throw new Error("Unable to extract timestamp and signatures from header");
	}

	const timestampAge = Math.floor(Date.now() / 1000) - timestamp;
	if (timestampAge > STRIPE_SIGNATURE_TOLERANCE_SECONDS) {
		throw new Error("Timestamp outside the tolerance zone");
	}

	const signedPayload = `${timestamp}.${payload}`;
	const expectedHmac = createHmac("sha256", secret).update(signedPayload).digest("hex");
	const expectedBuf = Buffer.from(expectedHmac, "hex");

	const matched = signatures.some((sig) => {
		try {
			const sigBuf = Buffer.from(sig, "hex");
			return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
		} catch {
			return false;
		}
	});

	if (!matched) {
		throw new Error(
			"No signatures found matching the expected signature for payload.",
		);
	}
}

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

	try {
		verifyStripeSignatureHeader(body, signature, secret);
	} catch (error) {
		throw new Error(
			`Invalid webhook signature: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
		);
	}

	return JSON.parse(body) as Stripe.Event;
}
