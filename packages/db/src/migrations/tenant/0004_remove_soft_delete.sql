ALTER TABLE "hierarchy_nodes" DROP COLUMN IF EXISTS "deleted_at";--> statement-breakpoint
DROP INDEX IF EXISTS "hierarchy_deleted_at_idx";
