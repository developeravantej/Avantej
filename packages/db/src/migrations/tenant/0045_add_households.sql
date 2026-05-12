-- migration: 0045_add_households
-- description: Agent 3.6 (Phase 3) — household linking.
--   * households: groups customer_profiles into a billing/family unit.
--   * customer_profiles.household_id: reverse pointer (ON DELETE SET NULL).
--   * Cycle households.primary_contact_profile_id <-> customer_profiles.household_id
--     resolved with DEFERRABLE INITIALLY DEFERRED on the households side, so a
--     fresh household + primary profile can be inserted in a single tx in any order.
--     Drizzle's generator cannot emit DEFERRABLE — this migration is hand-rolled raw SQL.
--   * All FKs ON DELETE SET NULL: profile rows survive household deletion and
--     household rows survive primary-contact profile deletion.
--   * Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"primary_contact_profile_id" uuid,
	"notes" text,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "household_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "customer_profiles"
		ADD CONSTRAINT "customer_profiles_household_id_fk"
		FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- DEFERRABLE for cycle: households.primary_contact_profile_id -> customer_profiles.id
DO $$ BEGIN
	ALTER TABLE "households"
		ADD CONSTRAINT "households_primary_contact_profile_id_fk"
		FOREIGN KEY ("primary_contact_profile_id") REFERENCES "customer_profiles"("id") ON DELETE set null
		DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_household_idx"
	ON "customer_profiles" ("household_id");
--> statement-breakpoint
-- Assertion: verify the deferrable flag was actually set (Drizzle won't otherwise)
DO $$
DECLARE
	is_deferrable boolean;
BEGIN
	SELECT condeferrable INTO is_deferrable FROM pg_constraint
	 WHERE conname = 'households_primary_contact_profile_id_fk';
	IF is_deferrable IS NULL OR NOT is_deferrable THEN
		RAISE EXCEPTION 'DEFERRABLE flag missing on households_primary_contact_profile_id_fk';
	END IF;
END$$;
