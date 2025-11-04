ALTER TABLE "organizations" ADD COLUMN "stripe_connect_account_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_connect_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_connect_account_type" text DEFAULT 'franchiser' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_connect_onboarding_completed_at" timestamp;--> statement-breakpoint
CREATE INDEX "organizations_stripe_connect_idx" ON "organizations" USING btree ("stripe_connect_account_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_connect_account_id_unique" UNIQUE("stripe_connect_account_id");