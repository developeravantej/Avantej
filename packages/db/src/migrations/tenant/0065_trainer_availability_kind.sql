-- 0065_trainer_availability_kind.sql
-- Add a `kind` enum column to trainer_availability for Available / Blocked / Time-off slots.
-- Idempotent: safe to re-run on partially-migrated tenants.

-- 1. Create enum type (idempotent)
DO $$
BEGIN
  CREATE TYPE trainer_availability_kind AS ENUM ('available', 'blocked', 'timeoff');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add column with default so existing rows stay 'available'
ALTER TABLE trainer_availability
  ADD COLUMN IF NOT EXISTS kind trainer_availability_kind NOT NULL DEFAULT 'available';
