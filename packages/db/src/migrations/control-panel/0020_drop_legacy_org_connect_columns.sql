-- Plan B Phase 4.5 — Drop legacy org-level Stripe Connect columns.
--
-- All Connect state has migrated to org_country_stripe_accounts (Phase 4.1
-- + backfill ran in 4.1 for existing accts; ongoing flow via OAuth callback
-- + account.updated webhook since Phase 4.2/4.3). Callers no longer read
-- these columns (helper rewrites in Phase 4.4 + this commit).
--
-- Pre-flight verification (already done at code level):
--   - getConnectAccountForOrg reads org_country_stripe_accounts only
--   - getConnectAccountForOrgCountry — no legacy fallback
--   - stripeConnect.getAccountStatus reads org_country_stripe_accounts
--   - stripeConnect-oauth callback no longer writes legacy fields
--   - account.updated webhook no longer writes legacy fields
--   - grep -rn 'stripeConnectAccountId\\b' apps/server/src returns no matches
--     outside this migration / schema file
--
-- Rollback: re-create columns + index, then re-run the Phase 4.1 backfill in
-- reverse (copy org_country_stripe_accounts row → organizations columns).
-- Practical only if rollback happens within the same release.

DROP INDEX IF EXISTS "organizations_stripe_connect_idx";

ALTER TABLE "organizations"
  DROP COLUMN IF EXISTS "stripe_connect_account_id",
  DROP COLUMN IF EXISTS "stripe_connect_status",
  DROP COLUMN IF EXISTS "stripe_connect_account_type",
  DROP COLUMN IF EXISTS "stripe_connect_onboarding_completed_at",
  DROP COLUMN IF EXISTS "charges_enabled",
  DROP COLUMN IF EXISTS "payouts_enabled",
  DROP COLUMN IF EXISTS "details_submitted",
  DROP COLUMN IF EXISTS "connect_account_updated_at";
