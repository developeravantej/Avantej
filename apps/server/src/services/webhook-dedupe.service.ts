/**
 * Webhook deduplication service.
 *
 * Primary idempotency layer for Stripe webhook handlers (ADR-0006).
 *
 * Flow:
 *   1. Webhook arrives -> claimWebhookEvent (INSERT or ON CONFLICT increment attempts).
 *   2. If status === 'already_processed', skip downstream handler (ack 200, deduped).
 *   3. If status === 'claimed' or 'retry', run handler.
 *      - On success: markEventProcessed.
 *      - On failure: markEventFailed; return 500 so Stripe retries.
 *
 * The Stripe event.id (evt_xxx) is globally unique and is the primary key.
 */

import { eq, sql } from "drizzle-orm";
import { controlPanelDb } from "@/lib/db";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";

export type WebhookSource = "platform" | "connect" | "reconciler";

export type ClaimResult =
	| { status: "claimed"; attempts: number }
	| { status: "already_processed"; attempts: number }
	| { status: "retry"; attempts: number };

interface ClaimInput {
	eventId: string;
	eventType: string;
	source: WebhookSource;
	stripeAccount: string | null;
}

export async function claimWebhookEvent(input: ClaimInput): Promise<ClaimResult> {
	const [row] = await controlPanelDb
		.insert(processedWebhookEvents)
		.values({
			eventId: input.eventId,
			eventType: input.eventType,
			source: input.source,
			stripeAccount: input.stripeAccount,
		})
		.onConflictDoUpdate({
			target: processedWebhookEvents.eventId,
			set: { attempts: sql`${processedWebhookEvents.attempts} + 1` },
		})
		.returning({
			attempts: processedWebhookEvents.attempts,
			processedAt: processedWebhookEvents.processedAt,
		});

	if (!row) {
		throw new Error("claimWebhookEvent: insert returned no row");
	}

	if (row.processedAt !== null) {
		return { status: "already_processed", attempts: row.attempts };
	}
	if (row.attempts > 1) {
		return { status: "retry", attempts: row.attempts };
	}
	return { status: "claimed", attempts: row.attempts };
}

export async function markEventProcessed(eventId: string): Promise<void> {
	await controlPanelDb
		.update(processedWebhookEvents)
		.set({ processedAt: new Date(), error: null })
		.where(eq(processedWebhookEvents.eventId, eventId));
}

export async function markEventFailed(eventId: string, error: string): Promise<void> {
	await controlPanelDb
		.update(processedWebhookEvents)
		.set({ error })
		.where(eq(processedWebhookEvents.eventId, eventId));
}
