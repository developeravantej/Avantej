-- Add per-org IANA timezone for availability/booking math.
-- Backfill is automatic via DEFAULT. Idempotent.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'Asia/Kuala_Lumpur';
