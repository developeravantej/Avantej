-- Flaw #9: price snapshot at booking (commission reads this, not live price)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price_snapshot_cents integer;

-- Flaw #10: pin commission config version at booking, not at completion (audit anchor only)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS config_version_id uuid
  REFERENCES category_commission_config_versions(id);

-- Flaw #11: appointment-level comp flag (no sales order required)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_complimentary boolean
  NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS complimentary_reason text;

-- Flaw #13: actor who created the manual adjustment, needed for Review tab "created by" display.
ALTER TABLE commission_splits ADD COLUMN IF NOT EXISTS created_by_user_id text;

-- Index to speed up the new Review tab query.
-- Both columns match the ORDER BY (earned_at DESC, id DESC) and the composite cursor
-- filter. A single-column index on earned_at alone cannot cover the id tie-breaker.
CREATE INDEX IF NOT EXISTS commission_splits_pending_review_idx
  ON commission_splits(earned_at DESC, id DESC)
  WHERE status = 'pending_review';
