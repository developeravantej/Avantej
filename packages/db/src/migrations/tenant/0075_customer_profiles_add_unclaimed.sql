ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS is_unclaimed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS customer_profiles_is_unclaimed_idx
  ON customer_profiles (is_unclaimed)
  WHERE is_unclaimed = true;
