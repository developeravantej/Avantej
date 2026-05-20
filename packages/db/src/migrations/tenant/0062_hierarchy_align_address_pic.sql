-- migration: 0062_hierarchy_align_address_pic
-- description: Restore address + pic_user_id columns on hierarchy_nodes if missing.
--   The Drizzle schema (packages/db/src/schema/tenant/hierarchy.ts) declares both
--   columns but some tenant DBs diverged from the schema. This is a defensive
--   alignment to keep `SELECT * FROM hierarchy_nodes` (and the query builder) safe.
--   Idempotent.

ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "address" text;
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "pic_user_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hierarchy_pic_user_idx" ON "hierarchy_nodes" ("pic_user_id");
