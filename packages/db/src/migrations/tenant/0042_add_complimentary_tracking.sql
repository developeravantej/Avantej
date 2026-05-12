-- migration: 0042_add_complimentary_tracking
-- description: Agent 3.3 — Phase 3 §5: comp/complimentary order tracking
--   * sales_orders.complimentary_reason: text, nullable. When set, the order is
--     marked comp and ALL lines are excluded from commission split creation.
--   * sales_order_items.commission_excluded: boolean default false. Per-line
--     opt-out so a single line on an otherwise normal order can be excluded.
--   * commission-splits.service.ts skips split creation when either flag fires.

ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "complimentary_reason" text;
--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "commission_excluded" boolean NOT NULL DEFAULT false;
