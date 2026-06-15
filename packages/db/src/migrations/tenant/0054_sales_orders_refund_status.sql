-- migration: 0054_sales_orders_refund_status
-- description: Add refund_status + refunded_amount_cents to sales_orders, backfill from refunds table.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Create enum sales_order_refund_status
-- ============================================================
DO $$ BEGIN
	CREATE TYPE "sales_order_refund_status" AS ENUM ('none', 'pending', 'partial', 'processed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================
-- 2. Add columns to sales_orders
-- ============================================================
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "refund_status" "sales_order_refund_status" NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "refunded_amount_cents" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- ============================================================
-- 3. Index
-- ============================================================
CREATE INDEX IF NOT EXISTS "sales_orders_refund_status_created_idx"
	ON "sales_orders" ("refund_status", "created_at" DESC);
--> statement-breakpoint

-- ============================================================
-- 4. Backfill from refunds table
--    refunds.status: 'processed' → 'processed', others → 'pending'
--    refunds.amount_cents used for refunded_amount_cents
-- ============================================================
UPDATE "sales_orders" so
SET
	"refund_status" = CASE
		WHEN r.max_status = 'processed' THEN 'processed'::"sales_order_refund_status"
		ELSE 'pending'::"sales_order_refund_status"
	END,
	"refunded_amount_cents" = COALESCE(r.total_amount, 0)
FROM (
	SELECT
		sales_order_id,
		MAX(status) AS max_status,
		SUM(amount_cents) AS total_amount
	FROM "refunds"
	WHERE sales_order_id IS NOT NULL
	GROUP BY sales_order_id
) r
WHERE so.id = r.sales_order_id
  AND r.sales_order_id IS NOT NULL;
