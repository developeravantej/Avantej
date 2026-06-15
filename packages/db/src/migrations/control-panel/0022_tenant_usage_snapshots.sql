-- Plan E E.2 — Tenant Usage Snapshots
-- Daily-cron rollup of per-tenant usage. See ADR-0023.

CREATE TABLE IF NOT EXISTS "tenant_usage_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "snapshot_date" date NOT NULL,
  "member_count" integer NOT NULL DEFAULT 0,
  "customer_count" integer NOT NULL DEFAULT 0,
  "appt_count_30d" integer NOT NULL DEFAULT 0,
  "sales_total_30d_minor" integer NOT NULL DEFAULT 0,
  "sales_currency" text NOT NULL DEFAULT 'MYR',
  "storage_bytes" bigint NOT NULL DEFAULT 0,
  "ghl_active" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_usage_snapshots_org_date_uq"
  ON "tenant_usage_snapshots" ("organization_id", "snapshot_date");

CREATE INDEX IF NOT EXISTS "tenant_usage_snapshots_org_idx"
  ON "tenant_usage_snapshots" ("organization_id", "snapshot_date" DESC);
