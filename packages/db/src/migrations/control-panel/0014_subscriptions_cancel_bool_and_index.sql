ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" TYPE boolean USING (cancel_at_period_end::boolean);
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "cancel_at_period_end" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_past_due_idx" ON "subscriptions" ("grace_period_ends_at") WHERE "status" = 'past_due';
