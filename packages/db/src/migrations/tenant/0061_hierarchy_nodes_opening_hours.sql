-- migration: 0061_hierarchy_nodes_opening_hours
-- description: Add opening_hours jsonb column to hierarchy_nodes (branch-level optional metadata).
--   address already exists — NOT re-added.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Add opening_hours column (nullable jsonb)
-- ============================================================
ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "opening_hours" jsonb;
