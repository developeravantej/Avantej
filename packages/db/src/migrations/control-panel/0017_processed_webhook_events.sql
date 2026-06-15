CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
    "event_id" text PRIMARY KEY NOT NULL,
    "event_type" text NOT NULL,
    "source" text NOT NULL,
    "stripe_account" text,
    "received_at" timestamp DEFAULT now() NOT NULL,
    "processed_at" timestamp,
    "attempts" integer DEFAULT 1 NOT NULL,
    "error" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_webhook_events_type_idx" ON "processed_webhook_events"("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_webhook_events_source_idx" ON "processed_webhook_events"("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processed_webhook_events_received_idx" ON "processed_webhook_events"("received_at");
