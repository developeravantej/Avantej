import { describe, it, expect, beforeEach } from "bun:test";
import { webhookRoutes } from "./webhooks.routes";
import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { controlPanelDb } from "@/lib/db";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { eq } from "drizzle-orm";

const PLATFORM_SECRET = "whsec_platform_test_xxx";
const CONNECT_SECRET = "whsec_connect_test_xxx";
const TEST_EVENT_ID = "evt_test_webhook_route_v2_001";
const TEST_SUB_ID = "sub_test_webhook_route_v2_001";

/**
 * Build a Stripe-Signature header the same way Stripe does:
 *   t=<timestamp>,v1=<HMAC-SHA256(t.payload, secret)>
 *
 * Uses node:crypto (synchronous) instead of stripe.webhooks.generateTestHeaderString
 * which is broken in Bun (SubtleCrypto is async-only).
 */
function signEvent(payload: string, secret: string): string {
	const timestamp = Math.floor(Date.now() / 1000);
	const signed = `${timestamp}.${payload}`;
	const hmac = createHmac("sha256", secret).update(signed, "utf8").digest("hex");
	return `t=${timestamp},v1=${hmac}`;
}

function setEnv(overrides: Record<string, string | undefined>) {
	(globalThis as unknown as { env?: Record<string, unknown> }).env = {
		...((globalThis as unknown as { env?: Record<string, unknown> }).env ?? {}),
		...overrides,
	};
}

beforeEach(async () => {
	await controlPanelDb
		.delete(processedWebhookEvents)
		.where(eq(processedWebhookEvents.eventId, TEST_EVENT_ID));
	await controlPanelDb
		.delete(subscriptions)
		.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
	setEnv({
		STRIPE_SECRET_KEY: "sk_test_dummy",
		STRIPE_PLATFORM_WEBHOOK_SECRET: PLATFORM_SECRET,
		STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT_SECRET,
		STRIPE_PRICE_BASIC: "price_basic_test",
		STRIPE_PRICE_PROFESSIONAL: "price_pro_test",
		STRIPE_PRICE_ENTERPRISE: "price_ent_test",
	});
});

describe("POST /webhooks/stripe/platform", () => {
	it("returns 400 on missing signature", async () => {
		const app = new Hono().route("/webhooks", webhookRoutes);
		const res = await app.request("/webhooks/stripe/platform", {
			method: "POST",
			body: "{}",
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 on invalid signature", async () => {
		const app = new Hono().route("/webhooks", webhookRoutes);
		const res = await app.request("/webhooks/stripe/platform", {
			method: "POST",
			headers: { "stripe-signature": "t=1,v1=garbage" },
			body: "{}",
		});
		expect(res.status).toBe(400);
	});

	it("processes customer.subscription.created and upserts row", async () => {
		const app = new Hono().route("/webhooks", webhookRoutes);
		const payload = JSON.stringify({
			id: TEST_EVENT_ID,
			type: "customer.subscription.created",
			data: {
				object: {
					id: TEST_SUB_ID,
					customer: "cus_test",
					status: "active",
					items: {
						data: [
							{
								price: { id: "price_pro_test", currency: "usd" },
								current_period_start: 1715000000,
								current_period_end: 1717678400,
							},
						],
					},
					cancel_at_period_end: false,
					canceled_at: null,
					trial_end: null,
					metadata: {},
				},
			},
		});
		const sig = signEvent(payload, PLATFORM_SECRET);
		const res = await app.request("/webhooks/stripe/platform", {
			method: "POST",
			headers: { "stripe-signature": sig },
			body: payload,
		});
		expect(res.status).toBe(200);

		const [row] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
		expect(row!.tier).toBe("professional");
		expect(row!.applicationFeeBps).toBe(200);
	});

	it("dedupes a duplicate event delivery", async () => {
		const app = new Hono().route("/webhooks", webhookRoutes);
		const payload = JSON.stringify({
			id: TEST_EVENT_ID,
			type: "customer.subscription.created",
			data: {
				object: {
					id: TEST_SUB_ID,
					customer: "cus_test",
					status: "active",
					items: {
						data: [
							{
								price: { id: "price_pro_test", currency: "usd" },
								current_period_start: 1715000000,
								current_period_end: 1717678400,
							},
						],
					},
					cancel_at_period_end: false,
					canceled_at: null,
					trial_end: null,
					metadata: {},
				},
			},
		});
		const sig = signEvent(payload, PLATFORM_SECRET);
		await app.request("/webhooks/stripe/platform", {
			method: "POST",
			headers: { "stripe-signature": sig },
			body: payload,
		});
		const res2 = await app.request("/webhooks/stripe/platform", {
			method: "POST",
			headers: { "stripe-signature": sig },
			body: payload,
		});
		expect(res2.status).toBe(200);

		const rows = await controlPanelDb
			.select()
			.from(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, TEST_EVENT_ID));
		expect(rows.length).toBe(1);
		expect(rows[0]!.attempts).toBe(2);
		expect(rows[0]!.processedAt).not.toBeNull();
	});

	it("marks sub past_due on invoice.payment_failed", async () => {
		const app = new Hono().route("/webhooks", webhookRoutes);
		// First seed the sub.
		const subEventPayload = JSON.stringify({
			id: "evt_test_seed_sub_route",
			type: "customer.subscription.created",
			data: {
				object: {
					id: TEST_SUB_ID,
					customer: "cus_test",
					status: "active",
					items: {
						data: [
							{
								price: { id: "price_basic_test", currency: "usd" },
								current_period_start: 1715000000,
								current_period_end: 1717678400,
							},
						],
					},
					cancel_at_period_end: false,
					canceled_at: null,
					trial_end: null,
					metadata: {},
				},
			},
		});
		await controlPanelDb
			.delete(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, "evt_test_seed_sub_route"));
		await app.request("/webhooks/stripe/platform", {
			method: "POST",
			headers: { "stripe-signature": signEvent(subEventPayload, PLATFORM_SECRET) },
			body: subEventPayload,
		});

		// Now fire payment_failed.
		const failPayload = JSON.stringify({
			id: TEST_EVENT_ID,
			type: "invoice.payment_failed",
			data: { object: { id: "in_test", subscription: TEST_SUB_ID } },
		});
		const res = await app.request("/webhooks/stripe/platform", {
			method: "POST",
			headers: { "stripe-signature": signEvent(failPayload, PLATFORM_SECRET) },
			body: failPayload,
		});
		expect(res.status).toBe(200);

		const [row] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
		expect(row!.status).toBe("past_due");
		expect(row!.pastDueAt).not.toBeNull();

		// Cleanup
		await controlPanelDb
			.delete(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, "evt_test_seed_sub_route"));
	});

	it("handles customer.subscription.deleted (status canceled, canceled_at set)", async () => {
		const app = new Hono().route("/webhooks", webhookRoutes);
		// First seed the sub via subscription.created.
		const subEventPayload = JSON.stringify({
			id: "evt_test_seed_deleted_route",
			type: "customer.subscription.created",
			data: {
				object: {
					id: TEST_SUB_ID,
					customer: "cus_test",
					status: "active",
					items: {
						data: [
							{
								price: { id: "price_basic_test", currency: "usd" },
								current_period_start: 1715000000,
								current_period_end: 1717678400,
							},
						],
					},
					cancel_at_period_end: false,
					canceled_at: null,
					trial_end: null,
					metadata: {},
				},
			},
		});
		await controlPanelDb
			.delete(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, "evt_test_seed_deleted_route"));
		await app.request("/webhooks/stripe/platform", {
			method: "POST",
			headers: { "stripe-signature": signEvent(subEventPayload, PLATFORM_SECRET) },
			body: subEventPayload,
		});

		// Now fire subscription.deleted with terminal state.
		const deletedPayload = JSON.stringify({
			id: TEST_EVENT_ID,
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: TEST_SUB_ID,
					customer: "cus_test",
					status: "canceled",
					items: {
						data: [
							{
								price: { id: "price_basic_test", currency: "usd" },
								current_period_start: 1715000000,
								current_period_end: 1717678400,
							},
						],
					},
					cancel_at_period_end: false,
					canceled_at: 1716500000,
					trial_end: null,
					metadata: {},
				},
			},
		});
		const res = await app.request("/webhooks/stripe/platform", {
			method: "POST",
			headers: { "stripe-signature": signEvent(deletedPayload, PLATFORM_SECRET) },
			body: deletedPayload,
		});
		expect(res.status).toBe(200);

		const [row] = await controlPanelDb
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
		expect(row!.status).toBe("canceled");
		expect(row!.canceledAt).not.toBeNull();
		expect(row!.canceledAt!.getTime()).toBe(1716500000 * 1000);

		// Cleanup
		await controlPanelDb
			.delete(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, "evt_test_seed_deleted_route"));
	});

	it("returns 200 for unhandled event types (no-op)", async () => {
		const app = new Hono().route("/webhooks", webhookRoutes);
		const payload = JSON.stringify({
			id: TEST_EVENT_ID,
			type: "balance.available", // not in our handler switch
			data: { object: {} },
		});
		const sig = signEvent(payload, PLATFORM_SECRET);
		const res = await app.request("/webhooks/stripe/platform", {
			method: "POST",
			headers: { "stripe-signature": sig },
			body: payload,
		});
		expect(res.status).toBe(200);
	});

	it("links organizations.subscriptionId via subscription metadata.organizationId", async () => {
		// Seed org with no sub link.
		const TEST_LINK_ORG_ID = "00000000-0000-0000-0000-2222000000aa";
		await controlPanelDb
			.delete(organizations)
			.where(eq(organizations.id, TEST_LINK_ORG_ID));
		await controlPanelDb.insert(organizations).values({
			id: TEST_LINK_ORG_ID,
			name: "Webhook Link Test Org",
			slug: `webhook-link-${Date.now()}`,
			neonProjectId: `stub-webhook-${Date.now()}`,
			connectionString: "stub",
			paymentStatus: "active",
			subscriptionId: null,
		} satisfies typeof organizations.$inferInsert);

		const app = new Hono().route("/webhooks", webhookRoutes);
		const payload = JSON.stringify({
			id: TEST_EVENT_ID,
			type: "customer.subscription.created",
			data: {
				object: {
					id: TEST_SUB_ID,
					customer: "cus_link",
					status: "active",
					items: {
						data: [
							{
								price: { id: "price_basic_test", currency: "usd" },
								current_period_start: 1715000000,
								current_period_end: 1717678400,
							},
						],
					},
					cancel_at_period_end: false,
					canceled_at: null,
					trial_end: null,
					metadata: { organizationId: TEST_LINK_ORG_ID },
				},
			},
		});
		const sig = signEvent(payload, PLATFORM_SECRET);
		const res = await app.request("/webhooks/stripe/platform", {
			method: "POST",
			headers: { "stripe-signature": sig },
			body: payload,
		});
		expect(res.status).toBe(200);

		const [linkedOrg] = await controlPanelDb
			.select()
			.from(organizations)
			.where(eq(organizations.id, TEST_LINK_ORG_ID));
		expect(linkedOrg!.subscriptionId).not.toBeNull();

		// Cleanup
		await controlPanelDb
			.delete(organizations)
			.where(eq(organizations.id, TEST_LINK_ORG_ID));
	});
});

describe("POST /webhooks/stripe/connect", () => {
	it("returns 400 on missing signature", async () => {
		const app = new Hono().route("/webhooks", webhookRoutes);
		const res = await app.request("/webhooks/stripe/connect", {
			method: "POST",
			body: "{}",
		});
		expect(res.status).toBe(400);
	});

	it("acks 200 for connect events (v1 stub) and records dedupe row", async () => {
		const app = new Hono().route("/webhooks", webhookRoutes);
		const payload = JSON.stringify({
			id: TEST_EVENT_ID,
			type: "payment_intent.succeeded",
			account: "acct_test",
			data: { object: { id: "pi_test" } },
		});
		const sig = signEvent(payload, CONNECT_SECRET);
		const res = await app.request("/webhooks/stripe/connect", {
			method: "POST",
			headers: { "stripe-signature": sig },
			body: payload,
		});
		expect(res.status).toBe(200);

		const [row] = await controlPanelDb
			.select()
			.from(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, TEST_EVENT_ID));
		expect(row!.source).toBe("connect");
		expect(row!.stripeAccount).toBe("acct_test");
		expect(row!.processedAt).not.toBeNull();
	});
});
