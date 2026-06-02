-- Phase H1: rename hierarchy 'region' → 'state', shift branch depth 4 → 3.
-- Prerequisite: zero rows with type='area' (run flatten-areas.ts first per tenant).
-- Idempotent: WHERE clauses make repeat runs no-op.

-- All of this runs only while hierarchy_nodes.type is still TEXT. After 0057
-- converts the column to the hierarchy_node_type enum (which has no 'area' or
-- 'region' member), comparing the enum to those literals throws
-- `invalid input value for enum`. Guarding on the column type makes a re-run on a
-- drifted/already-migrated tenant a safe no-op (the rename + depth shift are done).
DO $$
DECLARE area_count int; col_type text;
BEGIN
  SELECT data_type INTO col_type FROM information_schema.columns
   WHERE table_name = 'hierarchy_nodes' AND column_name = 'type';

  IF col_type = 'text' THEN
    -- Safety: hard-fail if area rows still exist
    SELECT count(*) INTO area_count FROM hierarchy_nodes WHERE type = 'area';
    IF area_count > 0 THEN
      RAISE EXCEPTION 'Migration blocked: % area row(s) exist. Run flatten-areas.ts first.', area_count;
    END IF;

    UPDATE hierarchy_nodes SET type = 'state', updated_at = now() WHERE type = 'region';
    UPDATE hierarchy_nodes SET depth = 3, updated_at = now() WHERE type = 'branch' AND depth = 4;
  END IF;
END $$;
