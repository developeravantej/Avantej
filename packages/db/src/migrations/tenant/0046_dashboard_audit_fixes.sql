-- migration: 0046_dashboard_audit_fixes
-- description: Dashboard audit fixes — FK relationships, missing columns, index coverage,
--   promotion_usages sales_order_id text→uuid, commission_splits boolean flags,
--   cap/floor cols on commission config tables, payouts P0 NOT NULL drop.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. members — add leadSourceId, householdId, invitationId
-- ============================================================
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "lead_source_id" uuid;
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "invitation_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "members"
		ADD CONSTRAINT "members_lead_source_id_fk"
		FOREIGN KEY ("lead_source_id") REFERENCES "lead_sources"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "members"
		ADD CONSTRAINT "members_household_id_fk"
		FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "members"
		ADD CONSTRAINT "members_invitation_id_fk"
		FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_lead_source_idx" ON "members" ("lead_source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_household_idx" ON "members" ("household_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_invitation_idx" ON "members" ("invitation_id");

-- ============================================================
-- 2. walk_in_customers — add customerProfileId, convertedAt
-- ============================================================
ALTER TABLE "walk_in_customers" ADD COLUMN IF NOT EXISTS "customer_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "walk_in_customers" ADD COLUMN IF NOT EXISTS "converted_at" timestamptz;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "walk_in_customers"
		ADD CONSTRAINT "walk_in_customers_customer_profile_id_fk"
		FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "walk_in_customers_customer_profile_idx"
	ON "walk_in_customers" ("customer_profile_id");

-- ============================================================
-- 3. commission_splits — add 4 boolean flags + update CHECK
-- ============================================================
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "cap_applied" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "floor_applied" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "excluded" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "is_complimentary" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Drop old one-of-two check (name may vary across environments)
ALTER TABLE "commission_splits" DROP CONSTRAINT IF EXISTS "commission_splits_source_check";
--> statement-breakpoint
ALTER TABLE "commission_splits" DROP CONSTRAINT IF EXISTS "commission_splits_one_source_check";
--> statement-breakpoint
-- Add new one-of-three check (appointment | sales_order | package_instance)
ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_source_check"
	CHECK (
		((appointment_id IS NOT NULL)::int +
		 (sales_order_id IS NOT NULL)::int +
		 (package_instance_id IS NOT NULL)::int) = 1
	) NOT VALID;
--> statement-breakpoint
ALTER TABLE "commission_splits" VALIDATE CONSTRAINT "commission_splits_source_check";

-- ============================================================
-- 4. category_commission_configs + versions — add cap/floor cols
-- ============================================================
ALTER TABLE "category_commission_configs" ADD COLUMN IF NOT EXISTS "cap_amount_cents" integer;
--> statement-breakpoint
ALTER TABLE "category_commission_configs" ADD COLUMN IF NOT EXISTS "floor_amount_cents" integer;
--> statement-breakpoint
ALTER TABLE "category_commission_config_versions" ADD COLUMN IF NOT EXISTS "cap_amount_cents" integer;
--> statement-breakpoint
ALTER TABLE "category_commission_config_versions" ADD COLUMN IF NOT EXISTS "floor_amount_cents" integer;
--> statement-breakpoint
-- Extend fn_emit_commission_config_version to include cap/floor in snapshot INSERT.
-- (CREATE OR REPLACE — same AFTER INSERT trigger from 0034 continues to bind.)
CREATE OR REPLACE FUNCTION fn_emit_commission_config_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM category_commission_config_versions
    WHERE category_id = NEW.category_id;

  INSERT INTO category_commission_config_versions
    (category_id, config_id, version_number, payment_type, is_conditional,
     max_coaches, max_per_cycle_cents, exclude_if_discount_above_pct,
     cap_amount_cents, floor_amount_cents, created_by)
  VALUES
    (NEW.category_id, NEW.id, next_version, NEW.payment_type, NEW.is_conditional,
     NEW.max_coaches, NEW.max_per_cycle_cents, NEW.exclude_if_discount_above_pct,
     NEW.cap_amount_cents, NEW.floor_amount_cents, 'system');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. payouts — drop NOT NULL on appointment_id (P0 fix)
-- ============================================================
ALTER TABLE "payouts" ALTER COLUMN "appointment_id" DROP NOT NULL;

-- ============================================================
-- 6. sales_orders — add isComplimentary, complimentaryApprovedBy, walkInCustomerId
-- ============================================================
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "is_complimentary" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "complimentary_approved_by" text;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "walk_in_customer_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sales_orders"
		ADD CONSTRAINT "sales_orders_walk_in_customer_id_fk"
		FOREIGN KEY ("walk_in_customer_id") REFERENCES "walk_in_customers"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_walk_in_customer_idx"
	ON "sales_orders" ("walk_in_customer_id");

-- ============================================================
-- 7. sales_order_items — add tax snapshot cols
-- ============================================================
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "tax_rate_bps" integer;
--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "tax_rate_code" text;

-- ============================================================
-- 8. payment_items — add tax snapshot cols
-- ============================================================
ALTER TABLE "payment_items" ADD COLUMN IF NOT EXISTS "tax_rate_bps" integer;
--> statement-breakpoint
ALTER TABLE "payment_items" ADD COLUMN IF NOT EXISTS "tax_rate_code" text;

-- ============================================================
-- 9. transfer_order_items — add damaged_qty
-- ============================================================
ALTER TABLE "transfer_order_items" ADD COLUMN IF NOT EXISTS "damaged_qty" integer;

-- ============================================================
-- 10. stock_request_items — add approved_qty
-- ============================================================
ALTER TABLE "stock_request_items" ADD COLUMN IF NOT EXISTS "approved_qty" integer;

-- ============================================================
-- 11. google_calendar_connections — add encryption_key_id, token_rotated_at
-- ============================================================
ALTER TABLE "google_calendar_connections" ADD COLUMN IF NOT EXISTS "encryption_key_id" text;
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN IF NOT EXISTS "token_rotated_at" timestamptz;

-- ============================================================
-- 12. check_ins — add FK on existing package_instance_id + index
-- ============================================================
DO $$ BEGIN
	ALTER TABLE "check_ins"
		ADD CONSTRAINT "check_ins_package_instance_id_fk"
		FOREIGN KEY ("package_instance_id") REFERENCES "package_instances"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "check_ins_package_instance_idx"
	ON "check_ins" ("package_instance_id");

-- ============================================================
-- 13. commission_split_reversals — add 2 missing indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS "commission_split_reversals_payout_adj_idx"
	ON "commission_split_reversals" ("payout_adjustment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_split_reversals_reversed_by_idx"
	ON "commission_split_reversals" ("reversed_by_reversal_id");

-- ============================================================
-- 14. promotion_usages — migrate sales_order_id from text → uuid with FK
-- ============================================================
-- Drop unique index that includes the text column first
DROP INDEX IF EXISTS "promo_usages_unique_customer_order";
--> statement-breakpoint
-- Add new uuid column
ALTER TABLE "promotion_usages" ADD COLUMN IF NOT EXISTS "sales_order_id_new" uuid;
--> statement-breakpoint
-- Backfill: cast only well-formed UUIDs (no-op on dev; safe for prod rows)
UPDATE "promotion_usages"
	SET "sales_order_id_new" = "sales_order_id"::uuid
	WHERE "sales_order_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--> statement-breakpoint
-- Drop old text column
ALTER TABLE "promotion_usages" DROP COLUMN IF EXISTS "sales_order_id";
--> statement-breakpoint
-- Rename new column into place
ALTER TABLE "promotion_usages" RENAME COLUMN "sales_order_id_new" TO "sales_order_id";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "promotion_usages"
		ADD CONSTRAINT "promotion_usages_sales_order_id_fk"
		FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- Recreate unique index with uuid column
CREATE UNIQUE INDEX IF NOT EXISTS "promo_usages_unique_customer_order"
	ON "promotion_usages" ("promotion_id", "customer_id", "sales_order_id");
--> statement-breakpoint
-- Non-unique lookup index
CREATE INDEX IF NOT EXISTS "promotion_usages_sales_order_idx"
	ON "promotion_usages" ("sales_order_id");
