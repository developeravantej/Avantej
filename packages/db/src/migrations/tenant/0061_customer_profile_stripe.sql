-- Plan B Phase 3d — card-on-file support.
--
-- Each tenant client gets a Stripe Customer object on the tenant's Connect
-- account (NOT the platform). The PM saved via SetupIntent lives on that
-- Customer. Off-session charges later cite both ids.
--
-- Phase 4 readiness: the Stripe Customer id is scoped to the tenant's Connect
-- account snapshot. Multi-country branch acct migration will need a separate
-- Customer per acct (deferred — single org-level acct for now).

ALTER TABLE "customer_profiles"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_connect_account_id_snapshot" text,
  ADD COLUMN IF NOT EXISTS "default_payment_method_id" text;

CREATE INDEX IF NOT EXISTS "customer_profiles_stripe_customer_idx"
  ON "customer_profiles" ("stripe_customer_id");
