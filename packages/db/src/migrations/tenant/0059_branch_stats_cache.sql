-- migration: 0059_branch_stats_cache
-- description: Create branch_stats_cache table for write-through branch aggregate caching.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Create table
-- ============================================================
CREATE TABLE IF NOT EXISTS "branch_stats_cache" (
	"hierarchy_node_id" uuid PRIMARY KEY REFERENCES "hierarchy_nodes"("id") ON DELETE CASCADE,
	"members_count" integer NOT NULL DEFAULT 0,
	"staff_count" integer NOT NULL DEFAULT 0,
	"month_revenue_cents" integer NOT NULL DEFAULT 0,
	"month_revenue_period_start" timestamp with time zone NOT NULL DEFAULT date_trunc('month', NOW()),
	"computed_at" timestamp with time zone NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- ============================================================
-- 2. Index on computed_at for staleness checks
-- ============================================================
CREATE INDEX IF NOT EXISTS "branch_stats_cache_computed_at_idx"
	ON "branch_stats_cache" ("computed_at");
