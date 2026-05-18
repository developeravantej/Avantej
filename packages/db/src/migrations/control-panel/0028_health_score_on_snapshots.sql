-- Plan F.1.5 — Health score + risk flags on tenant_usage_snapshots (Agent H).
--
-- Adds two nullable columns to the existing daily snapshot table. The
-- cron will populate these on each new write from F.1.5 onward.
-- Historical rows stay NULL (no backfill — trend appears in 30d).
--
-- See ADR-0030 (health-score formula) and docs/plans/plan-f-ops-ux.md.

ALTER TABLE tenant_usage_snapshots
  ADD COLUMN IF NOT EXISTS health_score integer,
  ADD COLUMN IF NOT EXISTS risk_flags jsonb;
