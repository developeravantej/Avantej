ALTER TABLE "subscriptions" ADD COLUMN "stripe_price_id" text NOT NULL DEFAULT 'price_legacy_seed';
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "stripe_price_id" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "application_fee_bps" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "application_fee_bps" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "currency" text DEFAULT 'usd' NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "past_due_at" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "grace_period_ends_at" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "current_period_start" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "current_period_end" timestamp;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" text DEFAULT 'false' NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "canceled_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" ("status");
