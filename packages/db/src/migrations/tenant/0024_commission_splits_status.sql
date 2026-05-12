ALTER TABLE commission_splits
  ALTER COLUMN appointment_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES payouts(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS commission_splits_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS commission_splits_appt_staff_unique
  ON commission_splits(appointment_id, staff_id)
  WHERE appointment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commission_splits_so_staff_unique
  ON commission_splits(sales_order_id, staff_id)
  WHERE sales_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS commission_splits_status_idx ON commission_splits(status);
CREATE INDEX IF NOT EXISTS commission_splits_payout_idx ON commission_splits(payout_id);
CREATE INDEX IF NOT EXISTS commission_splits_sales_order_idx ON commission_splits(sales_order_id);

ALTER TABLE commission_splits
  ADD CONSTRAINT commission_splits_must_target_one
  CHECK (
    (appointment_id IS NOT NULL AND sales_order_id IS NULL)
    OR (sales_order_id IS NOT NULL AND appointment_id IS NULL)
  );
