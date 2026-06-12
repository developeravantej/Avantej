-- Persist the raw GHL lead_acquisition_type alongside the resolved lead_source FK,
-- so the value survives even when no lead_sources lookup row matches.
ALTER TABLE customer_profiles
	ADD COLUMN IF NOT EXISTS lead_acquisition_type text;
