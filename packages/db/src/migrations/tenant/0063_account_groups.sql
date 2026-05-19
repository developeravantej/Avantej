-- Phase 4 — Account groups for shared-email customers (e.g. family/friend
-- registrations from GHL forms where two customers share one inbox).
--
-- Adds an `account_groups` table that ties multiple `customer_profiles`
-- together under one primary login owner. Dependents have no `user_id`
-- (so they don't collide with `user.email` UNIQUE) and inherit access via
-- the primary's session in the Avantej UI.
--
-- All changes are additive:
--   * customer_profiles.user_id is relaxed to NULLABLE so dependents can
--     exist without a control-panel user row. The original
--     `customer_profiles_user_idx` UNIQUE index is dropped and replaced by
--     a PARTIAL UNIQUE index over non-null user_ids so primaries still get
--     1:1 enforcement.
--   * customer_profiles.account_group_id (nullable FK -> account_groups,
--     ON DELETE SET NULL) marks the dependent's group.
--   * customer_profiles.relationship (nullable text) captures free-form
--     tag like "family"/"friend"/"caregiver" set later by staff.
--
-- account_groups.primary_user_id stores the control-panel `user.id` of
-- the login owner. No FK constraint due to cross-database (control-panel
-- vs tenant). Application layer enforces referential integrity.

CREATE TABLE IF NOT EXISTS "account_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text,
  "primary_user_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "account_groups_primary_user_idx"
  ON "account_groups" ("primary_user_id");

ALTER TABLE "customer_profiles"
  ADD COLUMN IF NOT EXISTS "account_group_id" uuid REFERENCES "account_groups"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "relationship" text;

-- Drop the old TOTAL unique index on user_id (created by Drizzle as
-- customer_profiles_user_idx via .unique() in schema).
DROP INDEX IF EXISTS "customer_profiles_user_idx";

-- Relax user_id to NULL so dependents can exist without a user row.
ALTER TABLE "customer_profiles"
  ALTER COLUMN "user_id" DROP NOT NULL;

-- Re-enforce 1:1 user <-> customer_profile for primaries only.
CREATE UNIQUE INDEX IF NOT EXISTS "customer_profiles_user_id_unique_not_null"
  ON "customer_profiles" ("user_id") WHERE "user_id" IS NOT NULL;

-- Lookup index for dependents by group.
CREATE INDEX IF NOT EXISTS "customer_profiles_account_group_idx"
  ON "customer_profiles" ("account_group_id");
