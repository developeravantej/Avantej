import { describe, it, expect, beforeEach } from "bun:test";
import { verifyWebhookSignature, getStripeClient } from "./stripe";
import Stripe from "stripe";
import { createHmac } from "node:crypto";

const FAKE_PLATFORM_SECRET = "whsec_platform_test";
const FAKE_CONNECT_SECRET = "whsec_connect_test";

// Helper: produce a valid Stripe-Signature header for a payload + secret.
// Uses Node crypto directly because Stripe SDK's generateTestHeaderString
// relies on SubtleCryptoProvider which is async-only in bun's test environment.
// The format matches Stripe's spec: t=<unix_ts>,v1=<hex_hmac_sha256(ts.payload, secret)>
function signPayload(secret: string, payload: string): string {
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = createHmac("sha256", secret)
		.update(`${timestamp}.${payload}`)
		.digest("hex");
	return `t=${timestamp},v1=${signature}`;
}

// cloudflare:workers `env` is read at module-load time inside the lib; we
// stub it via a global before importing.
function setEnv(overrides: Record<string, string | undefined>) {
	(globalThis as unknown as { env?: Record<string, unknown> }).env = {
		...((globalThis as unknown as { env?: Record<string, unknown> }).env ?? {}),
		...overrides,
	};
}

describe("getStripeClient", () => {
	beforeEach(() => {
		setEnv({ STRIPE_SECRET_KEY: "sk_test_dummy" });
	});

	it("returns a Stripe SDK instance when the secret is set", () => {
		const client = getStripeClient();
		expect(client).toBeInstanceOf(Stripe);
	});
});

describe("verifyWebhookSignature", () => {
	beforeEach(() => {
		setEnv({
			STRIPE_SECRET_KEY: "sk_test_dummy",
			STRIPE_PLATFORM_WEBHOOK_SECRET: FAKE_PLATFORM_SECRET,
			STRIPE_CONNECT_WEBHOOK_SECRET: FAKE_CONNECT_SECRET,
		});
	});

	it("verifies a platform webhook signed with the platform secret", () => {
		const payload = JSON.stringify({ id: "evt_test_platform_001", type: "ping" });
		const sig = signPayload(FAKE_PLATFORM_SECRET, payload);
		const event = verifyWebhookSignature(payload, sig, "platform");
		expect(event.id).toBe("evt_test_platform_001");
	});

	it("verifies a connect webhook signed with the connect secret", () => {
		const payload = JSON.stringify({ id: "evt_test_connect_001", type: "ping" });
		const sig = signPayload(FAKE_CONNECT_SECRET, payload);
		const event = verifyWebhookSignature(payload, sig, "connect");
		expect(event.id).toBe("evt_test_connect_001");
	});

	it("rejects a platform webhook signed with the connect secret", () => {
		const payload = JSON.stringify({ id: "evt_test_002", type: "ping" });
		const sig = signPayload(FAKE_CONNECT_SECRET, payload);
		expect(() => verifyWebhookSignature(payload, sig, "platform")).toThrow();
	});

	it("rejects a connect webhook signed with the platform secret", () => {
		const payload = JSON.stringify({ id: "evt_test_003", type: "ping" });
		const sig = signPayload(FAKE_PLATFORM_SECRET, payload);
		expect(() => verifyWebhookSignature(payload, sig, "connect")).toThrow();
	});

	it("throws when no signature header is provided", () => {
		const payload = JSON.stringify({ id: "evt_x", type: "ping" });
		expect(() => verifyWebhookSignature(payload, null, "platform")).toThrow(
			/Missing Stripe-Signature/i,
		);
	});

	it("throws when the relevant secret env var is unset (platform)", () => {
		setEnv({ STRIPE_PLATFORM_WEBHOOK_SECRET: undefined as any });
		const payload = JSON.stringify({ id: "evt_x", type: "ping" });
		const sig = signPayload(FAKE_PLATFORM_SECRET, payload);
		expect(() => verifyWebhookSignature(payload, sig, "platform")).toThrow(
			/STRIPE_PLATFORM_WEBHOOK_SECRET/,
		);
	});
});
