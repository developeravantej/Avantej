-- F-SAAS-3 follow-up: Add last_stripe_event_at to subscriptions.
--
-- Replaces the updatedAt proxy used by markPastDue / markActive /
-- upsertSubscriptionFromStripe to guard against out-of-order Stripe
-- webhook delivery. Using updatedAt was imprecise because app writes
-- unrelated to Stripe events could advance updatedAt and silently drop
-- a legitimate newer Stripe event arriving within the same second.
--
-- The column is nullable on creation so the backfill below is graceful
-- for any rows that existed before this migration runs.
-- A separate follow-up can add NOT NULL once backfill is verified complete.

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "last_stripe_event_at" timestamp with time zone;
--> statement-breakpoint

-- Backfill: for all existing rows, seed last_stripe_event_at from updated_at
-- as the best available proxy for the last Stripe-driven write.
-- Idempotent: WHERE clause skips rows already populated.
UPDATE subscriptions SET last_stripe_event_at = updated_at WHERE last_stripe_event_at IS NULL;
