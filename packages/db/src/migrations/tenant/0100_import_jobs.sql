-- 0100_import_jobs.sql
--
-- WS6 (MOVE parity) — self-service CSV import history.
--
-- One row per committed (or failed) import run: which entity, how many rows
-- landed vs errored, and a jsonb summary of per-row outcomes. Purely a history
-- log — the actual data lands in the entity tables via their normal services.
-- Plain uuid / text columns, no cross-table FK (drift-check gate precedent).
--
-- Idempotent (CREATE TABLE / INDEX IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text,
	"entity" text NOT NULL,
	"status" text NOT NULL DEFAULT 'pending',
	"row_count" integer NOT NULL DEFAULT 0,
	"created_count" integer NOT NULL DEFAULT 0,
	"skipped_count" integer NOT NULL DEFAULT 0,
	"error_count" integer NOT NULL DEFAULT 0,
	"summary" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "import_jobs_org_created_idx"
	ON "import_jobs" ("organization_id", "created_at");
