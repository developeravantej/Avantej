-- GHL inbound approval gate (Phase G follow-up). When true, an inbound GHL
-- ContactCreate for a NEW contact is held in the tenant ghl_pending_contacts
-- table for staff approval instead of being materialized immediately. Default
-- false preserves the existing instant-sync behavior for all other tenants.
-- Idempotent.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "ghl_require_approval" boolean DEFAULT false;
