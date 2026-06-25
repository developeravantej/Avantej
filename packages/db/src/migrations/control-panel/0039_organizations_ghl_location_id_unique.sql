-- GHL Phase G: prevent two organizations (or an org + an active branch link)
-- from binding the same GHL location, which would interleave outbound writes
-- and route inbound webhooks ambiguously (cross-tenant bleed). Partial unique
-- index — NULLs (unconnected orgs) are exempt. Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_ghl_location_id_unique"
  ON "organizations" ("ghl_location_id")
  WHERE "ghl_location_id" IS NOT NULL;
