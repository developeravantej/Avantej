/**
 * Control Panel Processed Webhook Events
 *
 * Idempotency dedupe table for Stripe webhooks. See ADR-0006.
 *
 * eventId is the Stripe-issued globally unique event identifier (evt_xxx).
 * processed_at is null while a handler is in flight or after a failure;
 * set on successful handler completion.
 */

import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const processedWebhookEvents = pgTable(
	"processed_webhook_events",
	{
		eventId: text("event_id").primaryKey(), // evt_xxx
		eventType: text("event_type").notNull(),
		source: text("source").notNull(), // 'platform' | 'connect' | 'reconciler'
		stripeAccount: text("stripe_account"), // acct_xxx for connect events
		receivedAt: timestamp("received_at").defaultNow().notNull(),
		processedAt: timestamp("processed_at"),
		attempts: integer("attempts").default(1).notNull(),
		error: text("error"),
	},
	(table) => ({
		eventTypeIdx: index("processed_webhook_events_type_idx").on(
			table.eventType,
		),
		sourceIdx: index("processed_webhook_events_source_idx").on(table.source),
		receivedAtIdx: index("processed_webhook_events_received_idx").on(
			table.receivedAt,
		),
	}),
);
