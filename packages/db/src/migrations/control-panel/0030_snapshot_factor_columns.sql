-- Plan F.6 (Agent Sn) — Wire missing health-score factor columns.
--
-- F.1.5 launched the composite health-score formula but the snapshot
-- cron was only populating 2 of 5 factors (payment_status +
-- last_successful_payment_at). The remaining 3 factors emitted
-- `no_data` flags because their columns didn't exist.
--
-- Additive ALTER only. All nullable. No backfill — cron writes forward
-- per ADR-0030.
--
-- Columns:
--   last_admin_login_at            — max user.last_login_at among the
--                                    org's organization_members (admin
--                                    role) at snapshot time.
--   failed_webhooks_7d             — count of processed_webhook_events
--                                    flagged as failed in trailing 7d.
--                                    Global count for now (per-org
--                                    attribution requires schema work
--                                    on processed_webhook_events to
--                                    carry organization_id — TODO).
--   daily_active_members_30d_avg   — trailing-30d daily-active member
--                                    average. Tenant schema has no
--                                    activity column today — populated
--                                    as 0 / null until activity
--                                    tracking lands (TODO).

ALTER TABLE tenant_usage_snapshots
  ADD COLUMN IF NOT EXISTS last_admin_login_at timestamp,
  ADD COLUMN IF NOT EXISTS failed_webhooks_7d integer,
  ADD COLUMN IF NOT EXISTS daily_active_members_30d_avg integer;
