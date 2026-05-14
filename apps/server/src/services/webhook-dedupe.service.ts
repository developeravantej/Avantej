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
 *
 * All functions accept a request-scoped Drizzle client (`db`). Callers running
 * inside a Cloudflare Workers request must pass the request-scoped DB from
 * `getControlPanelDb(c)`; the module-level singleton triggers
 * "Cannot perform I/O on behalf of a different request" across requests.
 */

import { eq, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { controlPanelDb as singletonDb } from "@/lib/db";
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

// Drizzle's generated DB type is parameterized by a schema map we don't import
// here; use a structural alias so callers can pass any control-panel client.
type CpDb = NeonDatabase<Record<string, unknown>>;

function resolveDb(db?: CpDb): CpDb {
	return db ?? (singletonDb as unknown as CpDb);
}

export async function claimWebhookEvent(
	input: ClaimInput,
	db?: CpDb,
): Promise<ClaimResult> {
	const [row] = await resolveDb(db)
		.insert(processedWebhookEvents)
		.values({
			eventId: input.eventId,
			eventType: input.eventType,
			source: input.source,
			stripeAccount: input.stripeAccount,
		})
		.onConflictDoUpdate({
			target: processedWebhookEvents.eventId,
			set: {
				attempts: sql`${processedWebhookEvents.attempts} + 1`,
				error: null,
			},
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

export async function markEventProcessed(
	eventId: string,
	db?: CpDb,
): Promise<void> {
	const updated = await resolveDb(db)
		.update(processedWebhookEvents)
		.set({ processedAt: new Date(), error: null })
		.where(eq(processedWebhookEvents.eventId, eventId))
		.returning({ eventId: processedWebhookEvents.eventId });
	if (updated.length === 0) {
		throw new Error(
			`markEventProcessed: no row found for eventId=${eventId} (caller must claimWebhookEvent first)`,
		);
	}
}

export async function markEventFailed(
	eventId: string,
	error: string,
	db?: CpDb,
): Promise<void> {
	const updated = await resolveDb(db)
		.update(processedWebhookEvents)
		.set({ error })
		.where(eq(processedWebhookEvents.eventId, eventId))
		.returning({ eventId: processedWebhookEvents.eventId });
	if (updated.length === 0) {
		throw new Error(
			`markEventFailed: no row found for eventId=${eventId} (caller must claimWebhookEvent first)`,
		);
	}
}
