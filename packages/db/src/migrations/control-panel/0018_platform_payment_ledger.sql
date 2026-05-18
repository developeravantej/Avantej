CREATE TABLE IF NOT EXISTS "platform_payment_ledger" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_id" uuid,
    "event_kind" text NOT NULL,
    "stripe_event_id" text NOT NULL,
    "stripe_object_id" text NOT NULL,
    "stripe_account" text,
    "amount" integer NOT NULL,
    "application_fee" integer DEFAULT 0 NOT NULL,
    "currency" text DEFAULT 'usd' NOT NULL,
    "occurred_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "platform_payment_ledger_stripe_event_id_unique" UNIQUE ("stripe_event_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_org_idx" ON "platform_payment_ledger"("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_event_kind_idx" ON "platform_payment_ledger"("event_kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_occurred_idx" ON "platform_payment_ledger"("occurred_at");
