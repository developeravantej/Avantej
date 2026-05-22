-- Phase H1: rename hierarchy 'region' → 'state', shift branch depth 4 → 3.
-- Prerequisite: zero rows with type='area' (run flatten-areas.ts first per tenant).
-- Idempotent: WHERE clauses make repeat runs no-op.
--
-- IMPORTANT: compare via type::text, NOT `type = 'area'`/`type = 'region'`.
-- 'area' and 'region' are legacy enum labels that later migrations remove from
-- the hierarchy_node_type enum. On a tenant whose enum no longer contains them,
-- a bare `type = 'region'` makes Postgres cast the literal to the enum and fail
-- with `invalid input value for enum hierarchy_node_type: "region"` (22P02)
-- before any row is examined. Casting the column to text sidesteps the enum cast
-- so this migration is a true no-op when those values are already gone.

-- Safety: hard-fail if area rows still exist
DO $$
DECLARE area_count int;
BEGIN
  SELECT count(*) INTO area_count FROM hierarchy_nodes WHERE type::text = 'area';
  IF area_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % area row(s) exist. Run flatten-areas.ts first.', area_count;
  END IF;
END $$;
--> statement-breakpoint

UPDATE hierarchy_nodes SET type = 'state', updated_at = now() WHERE type::text = 'region';
--> statement-breakpoint

UPDATE hierarchy_nodes SET depth = 3, updated_at = now() WHERE type = 'branch' AND depth = 4;
