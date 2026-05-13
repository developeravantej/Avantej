import { describe, it, expect, beforeEach } from "bun:test";
import {
	verifyWebhookSignature,
	getStripeClient,
	__resetStripeClientForTesting,
} from "./stripe";
import Stripe from "stripe";

function setEnv(overrides: Record<string, string | undefined>) {
	(globalThis as unknown as { env?: Record<string, unknown> }).env = {
		...((globalThis as unknown as { env?: Record<string, unknown> }).env ?? {}),
		...overrides,
	};
}

describe("getStripeClient", () => {
	beforeEach(() => {
		__resetStripeClientForTesting();
		setEnv({ STRIPE_SECRET_KEY: "sk_test_dummy" });
	});

	it("returns a Stripe SDK instance when the secret is set", () => {
		const client = getStripeClient();
		expect(client).toBeInstanceOf(Stripe);
	});
});

describe("verifyWebhookSignature", () => {
	beforeEach(() => {
		__resetStripeClientForTesting();
		setEnv({
			STRIPE_SECRET_KEY: "sk_test_dummy",
			STRIPE_PLATFORM_WEBHOOK_SECRET: "whsec_platform_test",
			STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_connect_test",
		});
	});

	it("throws when no signature header is provided (platform)", async () => {
		await expect(verifyWebhookSignature("{}", null, "platform")).rejects.toThrow(/Missing Stripe-Signature/i);
	});

	it("throws when no signature header is provided (connect)", async () => {
		await expect(verifyWebhookSignature("{}", null, "connect")).rejects.toThrow(/Missing Stripe-Signature/i);
	});

	it("throws when STRIPE_PLATFORM_WEBHOOK_SECRET is unset and source=platform", async () => {
		setEnv({ STRIPE_PLATFORM_WEBHOOK_SECRET: undefined as unknown as string });
		await expect(verifyWebhookSignature("{}", "t=1,v1=fake", "platform")).rejects.toThrow(/STRIPE_PLATFORM_WEBHOOK_SECRET/);
	});

	it("throws when STRIPE_CONNECT_WEBHOOK_SECRET is unset and source=connect", async () => {
		setEnv({ STRIPE_CONNECT_WEBHOOK_SECRET: undefined as unknown as string });
		await expect(verifyWebhookSignature("{}", "t=1,v1=fake", "connect")).rejects.toThrow(/STRIPE_CONNECT_WEBHOOK_SECRET/);
	});

	it("throws InvalidSignature on garbage signature (delegated to Stripe SDK)", async () => {
		await expect(
			verifyWebhookSignature(JSON.stringify({ id: "evt_x" }), "t=1,v1=fake", "platform"),
		).rejects.toThrow(/Invalid webhook signature|Webhook signature verification failed/);
	});
});
