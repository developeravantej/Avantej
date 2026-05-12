-- migration: 0035_add_refund_items
-- description: Agent 2.8 — J5 partial-package refund line items
--   * refund_items: per-line refund records (one of sales_order_item or
--     package_instance), with optional credits_refunded for per-credit audit

CREATE TABLE IF NOT EXISTS "refund_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "refund_id" uuid NOT NULL,
  "sales_order_item_id" uuid,
  "package_instance_id" uuid,
  "credits_refunded" integer,
  "amount_cents" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_refund_id_fk"
    FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_sales_order_item_id_fk"
    FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_package_instance_id_fk"
    FOREIGN KEY ("package_instance_id") REFERENCES "package_instances"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_one_source_check"
    CHECK (num_nonnulls(sales_order_item_id, package_instance_id) = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_items_refund_idx" ON "refund_items" ("refund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_items_package_idx" ON "refund_items" ("package_instance_id");
