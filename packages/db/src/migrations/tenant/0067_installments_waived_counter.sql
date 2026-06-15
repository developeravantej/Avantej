-- Add installments_waived counter to package_instances
-- Tracks the number of installments administratively waived (distinct from paid or cancelled)
ALTER TABLE package_instances
  ADD COLUMN IF NOT EXISTS installments_waived integer NOT NULL DEFAULT 0;
