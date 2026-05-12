-- migration: 0038_add_goods_receipts_supplier_invoices
-- description: Agent 2.11 — goods-receipt 3-way match infrastructure
--   * goods_receipts: physical receipt records against a PO
--   * goods_receipt_items: per-line receipt detail (links to po_items.unit_cost)
--   * supplier_invoices: 3-way match (PO ≈ receipt ≈ invoice totals)

CREATE TABLE IF NOT EXISTS "goods_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "receipt_number" text NOT NULL,
  "purchase_order_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "received_at" timestamptz NOT NULL,
  "received_by" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fk"
    FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_branch_id_fk"
    FOREIGN KEY ("branch_id") REFERENCES "hierarchy_nodes"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipts_po_idx" ON "goods_receipts" ("purchase_order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_number_unique" ON "goods_receipts" ("receipt_number");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "goods_receipt_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "goods_receipt_id" uuid NOT NULL,
  "purchase_order_item_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity_received" integer NOT NULL,
  "quantity_damaged" integer NOT NULL DEFAULT 0,
  "notes" text
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_goods_receipt_id_fk"
    FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_purchase_order_item_id_fk"
    FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipt_items_receipt_idx" ON "goods_receipt_items" ("goods_receipt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipt_items_po_item_idx" ON "goods_receipt_items" ("purchase_order_item_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "supplier_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_number" text NOT NULL,
  "supplier_id" uuid NOT NULL,
  "purchase_order_id" uuid,
  "goods_receipt_id" uuid,
  "total_cents" integer NOT NULL,
  "tax_cents" integer NOT NULL DEFAULT 0,
  "invoice_date" timestamptz NOT NULL,
  "due_date" timestamptz,
  "status" text NOT NULL DEFAULT 'pending',
  "matched_at" timestamptz,
  "matched_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_fk"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchase_order_id_fk"
    FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_goods_receipt_id_fk"
    FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_po_idx" ON "supplier_invoices" ("purchase_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_receipt_idx" ON "supplier_invoices" ("goods_receipt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_supplier_idx" ON "supplier_invoices" ("supplier_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoices_number_unique" ON "supplier_invoices" ("supplier_id", "invoice_number");
