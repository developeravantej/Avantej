-- migration: 0043_add_commission_caps
-- description: Agent 3.4 — Phase 3 §5 commission caps/floors.
--   * category_commission_configs: max_per_cycle_cents (uncapped when null),
--     exclude_if_discount_above_pct (basis points; null = no exclusion)
--   * category_commission_config_versions: mirror both columns so snapshot
--     history preserves cap configuration
--   * fn_emit_commission_config_version: extend snapshot SQL to include new cols

ALTER TABLE "category_commission_configs"
  ADD COLUMN IF NOT EXISTS "max_per_cycle_cents" integer;
--> statement-breakpoint
ALTER TABLE "category_commission_configs"
  ADD COLUMN IF NOT EXISTS "exclude_if_discount_above_pct" integer;
--> statement-breakpoint

ALTER TABLE "category_commission_config_versions"
  ADD COLUMN IF NOT EXISTS "max_per_cycle_cents" integer;
--> statement-breakpoint
ALTER TABLE "category_commission_config_versions"
  ADD COLUMN IF NOT EXISTS "exclude_if_discount_above_pct" integer;
--> statement-breakpoint

-- Replace the trigger function so future config saves carry cap fields into
-- the version-history audit row. (CREATE OR REPLACE — same signature; the
-- AFTER INSERT trigger from 0034 continues to bind to this function.)
CREATE OR REPLACE FUNCTION fn_emit_commission_config_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM category_commission_config_versions
    WHERE category_id = NEW.category_id;

  INSERT INTO category_commission_config_versions
    (category_id, config_id, version_number, payment_type, is_conditional,
     max_coaches, max_per_cycle_cents, exclude_if_discount_above_pct, created_by)
  VALUES
    (NEW.category_id, NEW.id, next_version, NEW.payment_type, NEW.is_conditional,
     NEW.max_coaches, NEW.max_per_cycle_cents, NEW.exclude_if_discount_above_pct, 'system');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
