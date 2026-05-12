-- Phase G: add GHL org-shared sync columns to organizations (control panel DB).
-- Idempotent.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghl_location_id" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghl_api_key_encrypted" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghl_country_field_map" jsonb;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghl_provisioned_at" timestamp;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "ghl_sync_model" text;
--> statement-breakpoint
-- Default existing tenants to per-branch model to preserve current behavior.
UPDATE "organizations" SET "ghl_sync_model" = 'per-branch'
WHERE "ghl_sync_model" IS NULL;
