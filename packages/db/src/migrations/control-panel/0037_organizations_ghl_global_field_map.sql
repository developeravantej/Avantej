-- GHL Phase G: persist the org's global (location-level) custom-field ids
-- (gender, emergency contact, medical notes, ..., designated_country,
-- designated_branch) so the live customer-sync path can stamp contacts.
-- Previously ensureCustomFieldsExist's return value was discarded at connect
-- time, so these fields were created in GHL but never sent. Idempotent.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "ghl_global_field_map" jsonb;
