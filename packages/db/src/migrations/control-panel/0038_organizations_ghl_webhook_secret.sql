-- GHL Phase G: org-shared inbound webhook auth secret. Per-branch tenants
-- carry the secret on ghl_branch_links; org-shared tenants have no link row
-- (migrate-tenant-to-org-shared deactivates it), so inbound webhooks had no
-- secret to verify against and no org to resolve. This column hosts the
-- per-org secret. Idempotent.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "ghl_webhook_secret" text;
