-- migration: 0066_commission_condition_between_check
-- description: Validate that commission_conditions with operator='between'
--   have threshold_max >= threshold. A reversed range (e.g. threshold=10,
--   threshold_max=5) makes every comparison `n >= threshold AND n <= threshold_max`
--   silently impossible, producing a zero-commission tier nobody notices.
--
-- Background: commission-calculator audit (round 2, flaw #16) — the engine
--   evaluates BETWEEN ranges with no input-side guard, so an admin typo
--   silently drops every commission this tier should have paid.
--
-- Constraint policy:
--   - operator='between'   → threshold_max IS NOT NULL AND threshold_max >= threshold
--   - operator='lt|lte|gt|gte|eq' → threshold_max IS NULL (or any value; ignored at calc time)
--
-- We enforce only the BETWEEN branch since the calculator only reads
-- threshold_max for that operator. Other operators with a stray threshold_max
-- are technically harmless but might confuse admins — out of scope for this
-- migration.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS then re-add.

ALTER TABLE "commission_conditions"
  DROP CONSTRAINT IF EXISTS "commission_conditions_between_range_valid";

ALTER TABLE "commission_conditions"
  ADD CONSTRAINT "commission_conditions_between_range_valid"
  CHECK (
    operator <> 'between'
    OR (threshold_max IS NOT NULL AND threshold_max >= threshold)
  );
