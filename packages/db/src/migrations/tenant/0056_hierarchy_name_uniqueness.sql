-- Phase H-hygiene: prevent duplicate sibling rows by enforcing uniqueness
-- on the (parent_id, name) key per type. App layer already validates this
-- on insert (hierarchy_validation.service.ts), but the DB-level constraint
-- catches programmatic inserts that bypass the service.
-- Note: existing branch-name partial unique covers the leaf level globally.

-- 1. Pre-flight dedup checks (hard-fail with actionable message).
-- The orchestrator will run merge-duplicate-siblings.ts on affected tenants
-- before applying this migration. CREATE UNIQUE INDEX would itself error if
-- duplicates exist, but the explicit checks give a clearer remediation hint.
DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT name FROM hierarchy_nodes
    WHERE type = 'country' AND archived_at IS NULL
    GROUP BY name HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % duplicate country name(s) exist. Run merge-duplicate-siblings.ts first.', dup_count;
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT parent_id, name FROM hierarchy_nodes
    WHERE type = 'state' AND archived_at IS NULL
    GROUP BY parent_id, name HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % duplicate state sibling(s) exist. Run merge-duplicate-siblings.ts first.', dup_count;
  END IF;
END $$;
--> statement-breakpoint
-- 2. Create the partial uniques (idempotent via IF NOT EXISTS).
-- Country names must be globally unique within an org (one tenant DB =
-- one org). No parent_id matching needed since the org root is the
-- only parent type=country can have.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_country_name_unique"
  ON "hierarchy_nodes" ("name")
  WHERE "type" = 'country' AND "archived_at" IS NULL;
--> statement-breakpoint
-- State names unique within their parent country.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_state_sibling_name_unique"
  ON "hierarchy_nodes" ("parent_id", "name")
  WHERE "type" = 'state' AND "archived_at" IS NULL;
