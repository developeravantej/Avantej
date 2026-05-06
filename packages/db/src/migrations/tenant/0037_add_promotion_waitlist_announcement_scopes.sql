-- migration: 0037_add_promotion_waitlist_announcement_scopes
-- description: Agent 2.10 (audit-driven §8.5)
--   1. payment_items.promotion_id FK + index (column already exists; constraint may be missing)
--   2. waitlist_entries polymorphic typed FKs (member / customer_profile / walk_in_customer)
--      + NOT VALID CHECK so legacy rows (with only user_id populated) keep validating.
--      No `client_type` discriminator — exactly-one-of CHECK suffices.
--   3. announcement_scopes junction for multi-branch announcements.
--
-- Schema deviation from plan brief:
--   Plan §8.5 stated waitlist_entries had an existing `member_id uuid` FK to members.
--   Actual current schema has `user_id text` (Better-Auth cross-DB id, no FK).
--   This migration ADDS member_id (new column) alongside customer_profile_id /
--   walk_in_customer_id. Legacy `user_id` is preserved (NOT NULL) for back-compat;
--   new writers should populate one of the typed FKs.

-- 1. payment_items.promotion_id FK (column exists, may lack constraint + index)
DO $$ BEGIN
  ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_promotion_id_fk"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_items_promotion_id_idx" ON "payment_items" ("promotion_id");
--> statement-breakpoint

-- 2. waitlist_entries: add typed FK columns + indexes + NOT VALID CHECK
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "member_id" uuid;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "customer_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "walk_in_customer_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_member_id_fk"
    FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_customer_profile_id_fk"
    FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_walk_in_customer_id_fk"
    FOREIGN KEY ("walk_in_customer_id") REFERENCES "walk_in_customers"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- CHECK: at most one typed-FK populated (allows zero for legacy rows w/ only user_id).
-- NOT VALID so existing rows (all NULL on new cols) skip validation; new/updated rows enforced.
DO $$ BEGIN
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_one_client_check"
    CHECK (num_nonnulls(member_id, customer_profile_id, walk_in_customer_id) <= 1) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_entries_member_idx" ON "waitlist_entries" ("member_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_entries_customer_profile_idx" ON "waitlist_entries" ("customer_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_entries_walk_in_customer_idx" ON "waitlist_entries" ("walk_in_customer_id");
--> statement-breakpoint

-- 3. announcement_scopes junction
CREATE TABLE IF NOT EXISTS "announcement_scopes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "announcement_scopes" ADD CONSTRAINT "announcement_scopes_announcement_id_fk"
    FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "announcement_scopes" ADD CONSTRAINT "announcement_scopes_branch_id_fk"
    FOREIGN KEY ("branch_id") REFERENCES "hierarchy_nodes"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_scopes_unique_idx" ON "announcement_scopes" ("announcement_id", "branch_id");
