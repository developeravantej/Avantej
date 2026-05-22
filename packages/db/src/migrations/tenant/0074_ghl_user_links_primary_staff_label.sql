-- migration: 0074_ghl_user_links_primary_staff_label
-- description: store each synced staff member's unique label in the org's GHL
--   "Primary Staff" dropdown, so an inbound lead webhook can resolve
--   primary_staff (a label string) to the exact member.
--   Idempotent — safe to re-run; no enum types.
ALTER TABLE "ghl_user_links" ADD COLUMN IF NOT EXISTS "primary_staff_option_label" text;
