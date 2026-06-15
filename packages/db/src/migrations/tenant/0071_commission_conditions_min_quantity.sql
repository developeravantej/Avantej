-- Flaw #7: add min_quantity to commission_conditions for POS tiered config matching.
-- NULL = "matches any quantity" (preserves first-condition-wins for existing configs).
ALTER TABLE commission_conditions ADD COLUMN IF NOT EXISTS min_quantity integer;
