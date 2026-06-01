-- migration: 0086_sales_orders_origination
-- description: Add sold_by and lead_source_user_id to sales_orders for
--   Phase 3 origination commission tracking. Both are cross-DB user refs
--   (plain text, NO FK constraint). No backfill — cashier ≠ closer;
--   NULL for historical rows is correct.

ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS sold_by text,
    ADD COLUMN IF NOT EXISTS lead_source_user_id text;

CREATE INDEX IF NOT EXISTS sales_orders_sold_by_idx
    ON sales_orders(sold_by)
    WHERE sold_by IS NOT NULL;
