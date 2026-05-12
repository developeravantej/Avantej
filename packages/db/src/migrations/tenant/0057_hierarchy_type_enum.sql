-- Phase H2: replace text-typed hierarchy_nodes.type with a Postgres enum
-- so future inserts can't smuggle in typos.
-- Idempotent: CREATE TYPE guarded via pg_type lookup; ALTER TABLE no-ops if
-- column is already the enum type.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hierarchy_node_type') THEN
    CREATE TYPE hierarchy_node_type AS ENUM ('organization', 'country', 'state', 'branch');
  END IF;
END $$;
--> statement-breakpoint

-- Pre-flight: any rows with a value outside the enum would block the cast.
-- Should be impossible post-H1, but verify.
DO $$
DECLARE bad_count int; bad_types text;
BEGIN
  SELECT count(DISTINCT type), string_agg(DISTINCT type, ', ')
    INTO bad_count, bad_types
  FROM hierarchy_nodes
  WHERE type NOT IN ('organization', 'country', 'state', 'branch');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % unexpected type value(s) in hierarchy_nodes: %', bad_count, bad_types;
  END IF;
END $$;
--> statement-breakpoint

-- Drop partial indexes that reference the type column; ALTER TYPE can't
-- proceed while a partial predicate compares enum to text literal.
DROP INDEX IF EXISTS "hierarchy_nodes_branch_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "hierarchy_country_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "hierarchy_state_sibling_name_unique";
--> statement-breakpoint

-- Convert the column. Cast via USING.
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'hierarchy_nodes' AND column_name = 'type';
  IF col_type = 'text' THEN
    ALTER TABLE hierarchy_nodes
      ALTER COLUMN type TYPE hierarchy_node_type
      USING type::hierarchy_node_type;
  END IF;
END $$;
--> statement-breakpoint

-- Recreate partial indexes after type change.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_nodes_branch_name_unique"
  ON "hierarchy_nodes" ("name") WHERE "type" = 'branch';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_country_name_unique"
  ON "hierarchy_nodes" ("name")
  WHERE "type" = 'country' AND "archived_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_state_sibling_name_unique"
  ON "hierarchy_nodes" ("parent_id", "name")
  WHERE "type" = 'state' AND "archived_at" IS NULL;
