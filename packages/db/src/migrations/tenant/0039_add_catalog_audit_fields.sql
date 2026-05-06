-- migration: 0039_add_catalog_audit_fields
-- description: Agent 2.13 — §8.5 audit-added: createdBy/updatedBy on catalog tables
--   * services, products, brands, service_categories, product_categories
--   * Nullable text columns (existing rows have no actor recorded).
--   * Service-level write hooks set actor on every mutation.

ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "updated_by" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "updated_by" text;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "updated_by" text;
--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN IF NOT EXISTS "updated_by" text;
--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "updated_by" text;
