-- 0101_commission_track_sales_type (UAT §12 — renewal vs new-sale)
-- Adds the new-vs-renewal scoping dimension to commission tracks. Default 'any'
-- preserves every existing track's behaviour (fires regardless of sale type).
-- Idempotent — safe to re-run on partially migrated tenant branches.

ALTER TABLE "commission_tracks"
	ADD COLUMN IF NOT EXISTS "sales_type" text NOT NULL DEFAULT 'any';
