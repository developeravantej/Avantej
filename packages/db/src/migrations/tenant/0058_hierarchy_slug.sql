-- Phase H2: add stable per-node slug for URL routing / deep links.
-- Backfill from name; tighten to NOT NULL after backfill.

ALTER TABLE hierarchy_nodes ADD COLUMN IF NOT EXISTS slug text;
--> statement-breakpoint

-- Backfill slug = lower(name) with non-alphanumeric → '_'
UPDATE hierarchy_nodes
SET slug = trim(both '_' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))),
    updated_at = now()
WHERE slug IS NULL;
--> statement-breakpoint

-- Pre-flight: verify no NULLs remain before NOT NULL constraint.
DO $$
DECLARE null_count int;
BEGIN
  SELECT count(*) INTO null_count FROM hierarchy_nodes WHERE slug IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % rows still have NULL slug after backfill', null_count;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE hierarchy_nodes ALTER COLUMN slug SET NOT NULL;
--> statement-breakpoint

-- Sibling-scope uniqueness: slug must be unique within parent (matches name-uniqueness behaviour).
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_sibling_slug_unique"
  ON "hierarchy_nodes" ("parent_id", "slug")
  WHERE "archived_at" IS NULL;
