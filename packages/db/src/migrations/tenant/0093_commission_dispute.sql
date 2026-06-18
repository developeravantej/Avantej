-- Migration 0093 — Staff commission dispute / contest workflow.
--
-- Adds the columns that back a trainer-initiated dispute on a commission split.
-- A `pending` or `approved` split can be contested by its earner, moving it to
-- status='contested' (a plain text value — no enum to alter). A manager then
-- resolves it: uphold (restore contested_from_status), void, or adjust.
--
-- All columns are nullable and additive; idempotent ADD COLUMN IF NOT EXISTS so
-- re-runs on partially-migrated tenants are safe. No new index required — the
-- existing commission_splits_status_idx already serves the status='contested'
-- list query.

ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "contested_by" text;
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "contested_reason" text;
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "contested_category" text;
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "contested_at" timestamptz;
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "contested_from_status" text;
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "resolved_by" text;
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz;
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "resolution_note" text;
