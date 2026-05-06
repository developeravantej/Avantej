-- migration: 0044_add_lead_source
-- description: Agent 3.2 (Phase 3) — lead-source attribution.
--   * lead_sources: lookup table of acquisition channels.
--   * customer_profiles: 3 additive columns (lead_source_id, referrer_member_id, campaign_id).
--   * All FKs use ON DELETE SET NULL so profile rows survive lookup churn.
--   * Idempotent — safe to re-run; no enum types.

CREATE TABLE IF NOT EXISTS "lead_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_sources_name_unique" ON "lead_sources" ("name");
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "lead_source_id" uuid;
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "referrer_member_id" uuid;
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "campaign_id" text;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "customer_profiles"
		ADD CONSTRAINT "customer_profiles_lead_source_id_fk"
		FOREIGN KEY ("lead_source_id") REFERENCES "lead_sources"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "customer_profiles"
		ADD CONSTRAINT "customer_profiles_referrer_member_id_fk"
		FOREIGN KEY ("referrer_member_id") REFERENCES "members"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_lead_source_idx"
	ON "customer_profiles" ("lead_source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_referrer_member_idx"
	ON "customer_profiles" ("referrer_member_id");
