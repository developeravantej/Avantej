-- migration: 0073_customer_primary_staff_member
-- description: resolve the GHL lead webhook `primary_staff` to an Avantej member.
--   * customer_profiles.primary_staff_member_id: nullable FK -> members(id).
--   * ON DELETE SET NULL so the profile survives staff churn (mirrors referrer_member_id).
--   * Idempotent — safe to re-run; no enum types.
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "primary_staff_member_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "customer_profiles"
		ADD CONSTRAINT "customer_profiles_primary_staff_member_id_fk"
		FOREIGN KEY ("primary_staff_member_id") REFERENCES "members"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_primary_staff_member_idx"
	ON "customer_profiles" ("primary_staff_member_id");
