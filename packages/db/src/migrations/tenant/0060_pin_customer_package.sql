-- Pin Customer Package — Phase 1 schema.
-- Adds a nullable `pinned_at` timestamp to package_instances so a customer
-- can feature one of their active packages on the native dashboard.
-- The partial unique index enforces the single-pin-per-client invariant
-- at the DB layer; the application transaction is the primary guard, the
-- index is defense-in-depth against client races.

ALTER TABLE "package_instances"
  ADD COLUMN IF NOT EXISTS "pinned_at" timestamp with time zone;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "package_instances_one_pin_per_client_idx"
  ON "package_instances" ("client_id")
  WHERE "pinned_at" IS NOT NULL AND "client_id" IS NOT NULL;
