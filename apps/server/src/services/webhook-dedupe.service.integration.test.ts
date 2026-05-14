import { describe, it, expect, beforeEach } from "bun:test";
import {
	claimWebhookEvent,
	markEventProcessed,
	markEventFailed,
} from "./webhook-dedupe.service";
import { controlPanelDb } from "@/lib/db";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";
import { eq } from "drizzle-orm";

const TEST_EVENT_ID = "evt_test_dedupe_svc_001";

beforeEach(async () => {
	await controlPanelDb
		.delete(processedWebhookEvents)
		.where(eq(processedWebhookEvents.eventId, TEST_EVENT_ID));
});

describe("claimWebhookEvent", () => {
	it("returns 'claimed' on first call", async () => {
		const result = await claimWebhookEvent({
			eventId: TEST_EVENT_ID,
			eventType: "invoice.paid",
			source: "platform",
			stripeAccount: null,
		});
		expect(result.status).toBe("claimed");
		expect(result.attempts).toBe(1);
	});

	it("returns 'already_processed' on retry after success", async () => {
		await claimWebhookEvent({
			eventId: TEST_EVENT_ID,
			eventType: "invoice.paid",
			source: "platform",
			stripeAccount: null,
		});
		await markEventProcessed(TEST_EVENT_ID);
		const result = await claimWebhookEvent({
			eventId: TEST_EVENT_ID,
			eventType: "invoice.paid",
			source: "platform",
			stripeAccount: null,
		});
		expect(result.status).toBe("already_processed");
		expect(result.attempts).toBe(2);
	});

	it("returns 'retry' on retry after failure (attempts increments)", async () => {
		await claimWebhookEvent({
			eventId: TEST_EVENT_ID,
			eventType: "invoice.paid",
			source: "platform",
			stripeAccount: null,
		});
		await markEventFailed(TEST_EVENT_ID, "boom");
		const result = await claimWebhookEvent({
			eventId: TEST_EVENT_ID,
			eventType: "invoice.paid",
			source: "platform",
			stripeAccount: null,
		});
		expect(result.status).toBe("retry");
		expect(result.attempts).toBe(2);
	});

	it("accepts source = 'connect' with stripeAccount", async () => {
		const result = await claimWebhookEvent({
			eventId: TEST_EVENT_ID,
			eventType: "payment_intent.succeeded",
			source: "connect",
			stripeAccount: "acct_test_001",
		});
		expect(result.status).toBe("claimed");

		// Verify the row stores stripeAccount and source correctly
		const [row] = await controlPanelDb
			.select()
			.from(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, TEST_EVENT_ID));
		expect(row.source).toBe("connect");
		expect(row.stripeAccount).toBe("acct_test_001");
	});
});

describe("markEventProcessed", () => {
	it("sets processed_at and clears error", async () => {
		await claimWebhookEvent({
			eventId: TEST_EVENT_ID,
			eventType: "invoice.paid",
			source: "platform",
			stripeAccount: null,
		});
		await markEventFailed(TEST_EVENT_ID, "transient error");
		await markEventProcessed(TEST_EVENT_ID);
		const [row] = await controlPanelDb
			.select()
			.from(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, TEST_EVENT_ID));
		expect(row.processedAt).not.toBeNull();
		expect(row.error).toBeNull();
	});

	it("throws if no row exists for the eventId", async () => {
		await expect(markEventProcessed("evt_does_not_exist_xyz")).rejects.toThrow(
			/no row found/,
		);
	});
});

describe("markEventFailed", () => {
	it("writes the error string", async () => {
		await claimWebhookEvent({
			eventId: TEST_EVENT_ID,
			eventType: "invoice.paid",
			source: "platform",
			stripeAccount: null,
		});
		await markEventFailed(TEST_EVENT_ID, "Handler exploded");
		const [row] = await controlPanelDb
			.select()
			.from(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, TEST_EVENT_ID));
		expect(row.error).toBe("Handler exploded");
		expect(row.processedAt).toBeNull();
	});

	it("throws if no row exists for the eventId", async () => {
		await expect(
			markEventFailed("evt_does_not_exist_xyz", "boom"),
		).rejects.toThrow(/no row found/);
	});
});
