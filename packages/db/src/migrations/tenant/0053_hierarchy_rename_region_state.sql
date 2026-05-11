-- Phase H1: rename hierarchy 'region' → 'state', shift branch depth 4 → 3.
-- Prerequisite: zero rows with type='area' (run flatten-areas.ts first per tenant).
-- Idempotent: WHERE clauses make repeat runs no-op.

-- Safety: hard-fail if area rows still exist
DO $$
DECLARE area_count int;
BEGIN
  SELECT count(*) INTO area_count FROM hierarchy_nodes WHERE type = 'area';
  IF area_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % area row(s) exist. Run flatten-areas.ts first.', area_count;
  END IF;
END $$;
--> statement-breakpoint

UPDATE hierarchy_nodes SET type = 'state', updated_at = now() WHERE type = 'region';
--> statement-breakpoint

UPDATE hierarchy_nodes SET depth = 3, updated_at = now() WHERE type = 'branch' AND depth = 4;
