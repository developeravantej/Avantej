-- PROPOSED tenant migration 0095 — branch_details fields needed by the legacy
-- `location` import that have no home today.
--
-- This is a PROPOSAL only. Do NOT copy into packages/db/src/migrations/tenant/
-- until the load-bearing fields are confirmed with the client (which of
-- branch_tier/pricing_tier/collective/region they actually use). Authoring it
-- here keeps it out of the verify:migrations / drift-check CI gate.
--
-- Workflow once approved: move to packages/db/src/migrations/tenant/0095_*.sql,
-- add matching Drizzle columns to schema/tenant/branch-details.ts, run
-- `bun gen:migrations`, commit both. See docs/TENANT_MIGRATION_WORKFLOW.md.

ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS branch_code     text;
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS display_name    text;
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS branch_tier     text;
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS pricing_tier    text;
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS status          text;   -- planning | pre_opening | active | inactive | closed
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS country_code    text;   -- MY | TH | SG
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS collective      text;
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS region          text;
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS city            text;
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS postal_code     text;
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS opening_date    timestamptz;
ALTER TABLE branch_details ADD COLUMN IF NOT EXISTS closing_date    timestamptz;

-- Idempotency note: re-running on a partially-migrated tenant is safe (IF NOT EXISTS).
