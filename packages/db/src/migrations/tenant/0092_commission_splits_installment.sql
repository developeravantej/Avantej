-- Migration 0092: Phase D — per-installment origination commission
-- Adds installment_id column to commission_splits so each installment clearance
-- can carry exactly one proportional origination split.
-- Replaces the (sales_order_id, track_id, staff_id) partial-unique index with
-- a four-column variant that allows one row per (order, track, staff, installment).

ALTER TABLE commission_splits ADD COLUMN IF NOT EXISTS installment_id uuid;

CREATE INDEX IF NOT EXISTS commission_splits_installment_idx
  ON commission_splits (installment_id);

-- Drop old three-column partial unique index (migration 0083)
DROP INDEX IF EXISTS commission_splits_so_track_staff_unique;

-- New four-column partial unique index:
-- NULL installment_id (front-load / single-payment rows) is normalised to a
-- sentinel UUID so the uniqueness still holds for legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS commission_splits_so_track_staff_inst_unique
  ON commission_splits (sales_order_id, track_id, staff_id, COALESCE(installment_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE sales_order_id IS NOT NULL;
