-- migration: 0047_add_composite_indexes
-- description: Add composite indexes for hot query patterns (Phase 7.4)
--   commission_splits: (staff_id, status, earned_at DESC) for payout queries
--   sales_orders:      (customer_id, created_at DESC) for customer 360 view
--   payment_items:     (payment_id, item_type) for payment breakdown
-- Idempotent — safe to re-run.

CREATE INDEX IF NOT EXISTS "commission_splits_staff_status_earned_idx"
  ON "commission_splits" ("staff_id", "status", "earned_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_customer_created_idx"
  ON "sales_orders" ("customer_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_items_payment_type_idx"
  ON "payment_items" ("payment_id", "item_type");
