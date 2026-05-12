-- Phase G0: add country_node_id denorm FK + archived_at soft archive on hierarchy_nodes.
-- Idempotent.

ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "country_node_id" uuid REFERENCES "hierarchy_nodes"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hierarchy_country_idx" ON "hierarchy_nodes" ("country_node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hierarchy_archived_at_idx" ON "hierarchy_nodes" ("archived_at");
--> statement-breakpoint
-- Backfill country_node_id via recursive CTE for existing state + branch rows
WITH RECURSIVE ancestors AS (
  SELECT id, parent_id, type, id AS country_id FROM hierarchy_nodes WHERE type = 'country'
  UNION ALL
  SELECT h.id, h.parent_id, h.type, a.country_id
  FROM hierarchy_nodes h JOIN ancestors a ON h.parent_id = a.id
)
UPDATE hierarchy_nodes h SET country_node_id = a.country_id, updated_at = now()
FROM ancestors a
WHERE h.id = a.id AND h.type IN ('state', 'branch') AND h.country_node_id IS NULL;
