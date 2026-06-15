-- Full removal of the coach-payout-via-Stripe ("Partner Stripe Connect") feature.
-- Drops the partner connected-account store and the Stripe-transfer tracking
-- columns on payouts. Cash / bank-transfer / check payouts are unaffected.
-- Idempotent: safe to re-run on partially-migrated tenants.

DROP INDEX IF EXISTS "payouts_stripe_transfer_idx";
DROP INDEX IF EXISTS "payouts_stripe_payout_idx";

ALTER TABLE "payouts" DROP COLUMN IF EXISTS "stripe_transfer_id";
ALTER TABLE "payouts" DROP COLUMN IF EXISTS "stripe_payout_id";
ALTER TABLE "payouts" DROP COLUMN IF EXISTS "stripe_connect_account_id";

DROP TABLE IF EXISTS "partner_stripe_accounts";
