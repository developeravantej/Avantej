-- Migration: 0079 — stock_movements audit trail (F-INV-06)
-- Records every product-stock mutation with a signed delta and the source
-- document (goods receipt, transfer order, manual adjustment, etc.) so stock
-- changes are traceable. Previously adjustStock() mutated product_stock with no
-- audit linkage, losing the "who/why/from-what-document" trail.
--
-- Idempotent: re-runs on partially-migrated tenants are safe.

CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "hierarchy_nodes"("id") ON DELETE RESTRICT,
  "delta" integer NOT NULL,
  "quantity_after" integer,
  "reason" text NOT NULL,
  "source_type" text,
  "source_id" uuid,
  "actor_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "stock_movements_product_branch_idx"
  ON "stock_movements" ("product_id", "branch_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "stock_movements_source_idx"
  ON "stock_movements" ("source_type", "source_id");
