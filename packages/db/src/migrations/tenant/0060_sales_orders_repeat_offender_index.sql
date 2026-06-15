-- migration: 0060_sales_orders_repeat_offender_index
-- description: Partial index on sales_orders for repeat-offender (cancelled) customer lookups.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Partial index — cancelled orders per customer, sorted by date
-- ============================================================
CREATE INDEX IF NOT EXISTS "sales_orders_customer_status_created_idx"
	ON "sales_orders" ("customer_id", "status", "created_at" DESC)
	WHERE "status" = 'cancelled';
