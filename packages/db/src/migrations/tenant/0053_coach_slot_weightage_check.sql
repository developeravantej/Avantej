-- migration: 0053_coach_slot_weightage_check
-- description: Enforce that commission_coach_slots.weightage_basis_points
--   sums to 10000 (= 100%) per category_commission_configs.config_id.
--
-- Background: audit-swarm scalability lens flagged that there is no
-- DB-level guarantee a commission config has weightages totalling 100%.
-- A misconfigured config would silently misallocate commission to slots.
--
-- Implementation: deferred constraint-trigger (a regular CHECK can't
-- aggregate across rows). Runs at COMMIT, so multi-row inserts inside a
-- transaction (the normal admin-edit pattern) finish before validation.
--
-- Special cases:
--   - Empty config (0 slots) → allowed; the engine just won't fire splits.
--   - Single slot at 10000 → allowed.
--   - Sum < 10000 OR > 10000 → rejected with a readable message.
--
-- Idempotent: DROP IF EXISTS on both the function and trigger.

-- 1. Validation function — sums weightages for the affected config_id and
--    raises if the total is non-zero AND not exactly 10000.
CREATE OR REPLACE FUNCTION validate_coach_slot_weightage_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_config_id uuid;
  v_total integer;
BEGIN
  v_config_id := COALESCE(NEW.config_id, OLD.config_id);

  SELECT COALESCE(SUM(weightage_basis_points), 0)
    INTO v_total
    FROM commission_coach_slots
    WHERE config_id = v_config_id;

  IF v_total <> 0 AND v_total <> 10000 THEN
    RAISE EXCEPTION
      'commission_coach_slots weightages for config % must sum to 10000 bp (100%%); got % bp',
      v_config_id, v_total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

-- 2. Deferred constraint trigger — fires AFTER INSERT/UPDATE/DELETE on each
--    row, but the actual validation runs at COMMIT (deferred). This lets a
--    multi-row INSERT or UPDATE complete before checking the sum.
DROP TRIGGER IF EXISTS commission_coach_slots_weightage_check
  ON commission_coach_slots;

CREATE CONSTRAINT TRIGGER commission_coach_slots_weightage_check
  AFTER INSERT OR UPDATE OR DELETE ON commission_coach_slots
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_coach_slot_weightage_total();
