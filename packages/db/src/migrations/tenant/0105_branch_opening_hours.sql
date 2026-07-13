-- AVANTEJ-16: per-branch weekly opening hours.
-- Shape (jsonb): { "mon": { "open": "09:00", "close": "18:00" } | null, ... }
-- null day = closed; absent key = not set. Nullable so existing branches are
-- unchanged ("Opening hours not set" until an admin sets them).
ALTER TABLE "branch_details"
	ADD COLUMN IF NOT EXISTS "opening_hours" jsonb;
