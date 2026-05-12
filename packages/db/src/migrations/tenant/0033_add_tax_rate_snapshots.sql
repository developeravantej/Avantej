-- migration: 0033_add_tax_rate_snapshots
-- description: Agent 2.3 — Phase 2 Wave 3b — Journey J2
--   Capture tax_rate_id at line-item creation so historical orders / receipts
--   reproduce the applied rate after the underlying tax_rates row is edited.
--   Reserved 0033 because 0030 (appointment exclude), 0031 (status history),
--   and 0032 (parallel Agent 2.2 — branch pricing) are taken.

ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "tax_rate_id" uuid;
--> statement-breakpoint
ALTER TABLE "payment_items" ADD COLUMN IF NOT EXISTS "tax_rate_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_tax_rate_id_fk"
    FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_tax_rate_id_fk"
    FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_order_items_tax_rate_idx" ON "sales_order_items" ("tax_rate_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_items_tax_rate_idx" ON "payment_items" ("tax_rate_id");
