-- GHL Path C: cache the org's "Primary Staff" SINGLE_OPTIONS custom-field id
-- on organizations (one per org-shared GHL location). Idempotent.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "ghl_primary_staff_field_id" text;
