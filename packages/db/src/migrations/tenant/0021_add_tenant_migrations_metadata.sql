-- Add metadata columns to drizzle_migrations tracking table.
-- Idempotent — safe to apply on tenants that already have these columns
-- (e.g. provisioned via the embedded migrator that pre-dates the file-based loader).
ALTER TABLE "drizzle_migrations" ADD COLUMN IF NOT EXISTS "checksum" text;
--> statement-breakpoint
ALTER TABLE "drizzle_migrations" ADD COLUMN IF NOT EXISTS "applied_at" timestamptz NOT NULL DEFAULT now();
