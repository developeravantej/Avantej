-- Plan E E.8 — Tenant Deletions (GDPR soft + hard delete).
-- 30-day grace window before hard delete; restore zeroes restored_at.
-- See ADR-0026.

CREATE TABLE IF NOT EXISTS "tenant_deletions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "requested_at" timestamp DEFAULT now(),
  "requested_by" text NOT NULL,
  "hard_delete_after" timestamp NOT NULL,
  "restored_at" timestamp,
  "hard_deleted_at" timestamp,
  "export_url" text
);

-- Partial index — only rows that are still "open" (not restored, not hard-deleted)
-- can be picked up by the daily sweeper.
CREATE INDEX IF NOT EXISTS "tenant_deletions_hard_after_idx"
  ON "tenant_deletions" ("hard_delete_after")
  WHERE "hard_deleted_at" IS NULL AND "restored_at" IS NULL;

CREATE INDEX IF NOT EXISTS "tenant_deletions_org_idx"
  ON "tenant_deletions" ("organization_id");
