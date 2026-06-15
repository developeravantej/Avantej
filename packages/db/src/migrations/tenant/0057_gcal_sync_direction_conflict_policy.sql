-- migration: 0057_gcal_sync_direction_conflict_policy
-- description: Add sync_direction, conflict_policy enums + cached_calendar_list_json/at
--   to google_calendar_connections. last_sync_at already exists — NOT re-added.
--   Bundles Task 1.36 (cached_calendar_list_json + cached_calendar_list_at).
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Create enum gcal_sync_direction
-- ============================================================
DO $$ BEGIN
	CREATE TYPE "gcal_sync_direction" AS ENUM (
		'one_way_to_google',
		'one_way_from_google',
		'two_way'
	);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================
-- 2. Create enum gcal_conflict_policy
-- ============================================================
DO $$ BEGIN
	CREATE TYPE "gcal_conflict_policy" AS ENUM (
		'avantej_wins',
		'google_wins',
		'keep_both',
		'manual_review'
	);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================
-- 3. Add columns to google_calendar_connections
-- ============================================================
ALTER TABLE "google_calendar_connections"
	ADD COLUMN IF NOT EXISTS "sync_direction" "gcal_sync_direction" NOT NULL DEFAULT 'two_way';
--> statement-breakpoint
ALTER TABLE "google_calendar_connections"
	ADD COLUMN IF NOT EXISTS "conflict_policy" "gcal_conflict_policy" NOT NULL DEFAULT 'manual_review';
--> statement-breakpoint

-- ============================================================
-- 4. Task 1.36 — calendar list cache
-- ============================================================
ALTER TABLE "google_calendar_connections"
	ADD COLUMN IF NOT EXISTS "cached_calendar_list_json" text;
--> statement-breakpoint
ALTER TABLE "google_calendar_connections"
	ADD COLUMN IF NOT EXISTS "cached_calendar_list_at" timestamptz;
