-- Plan E follow-up — country on organizations.
--
-- The E.7 provisioning wizard captured country (MY/SG/TH) but stashed it
-- in admin_session_actions.metadata only. Promote to a first-class column
-- so list/filter/drill-in can read it.
--
-- Nullable for existing rows; new tenants from the wizard always set it.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "country_code" text;

CREATE INDEX IF NOT EXISTS "organizations_country_code_idx"
  ON "organizations" ("country_code");
