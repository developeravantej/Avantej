-- migration: 0055_sales_orders_cancellation_category
-- description: Add cancellation_reason_category enum column to sales_orders.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Create enum cancellation_reason_category
-- ============================================================
DO $$ BEGIN
	CREATE TYPE "cancellation_reason_category" AS ENUM (
		'customer_changed_mind',
		'payment_failed',
		'wrong_item',
		'fraud_suspected',
		'system_error',
		'other'
	);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================
-- 2. Add nullable column to sales_orders
-- ============================================================
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_reason_category" "cancellation_reason_category";
--> statement-breakpoint

-- ============================================================
-- 3. Partial index (only rows that have a category set)
-- ============================================================
CREATE INDEX IF NOT EXISTS "sales_orders_cancellation_category_idx"
	ON "sales_orders" ("cancellation_reason_category", "created_at" DESC)
	WHERE "cancellation_reason_category" IS NOT NULL;
