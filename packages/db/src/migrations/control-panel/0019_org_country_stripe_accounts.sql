-- Plan B Phase 4 — Per-country Stripe Connect accounts.
--
-- The Phase 1-3 model put a single stripe_connect_account_id on
-- organizations, scoped to one Stripe Connect Standard account (MY-only,
-- given the platform restriction at the time). Real franchises operate
-- across countries (MY / SG / TH branches), and each country needs its
-- own Stripe account (country-locked, native currency settlement).
--
-- This table holds one row per (organization, country) for the franchisee's
-- Stripe Connect account in that country. Branches resolve their acct via
-- their country hierarchy node -> country code -> this row.
--
-- Phase 1-3 single-acct rows on organizations are preserved during the
-- transition. A backfill script will copy the existing acct into a row here
-- with country derived from stripe.accounts.retrieve(). Callers continue
-- reading organizations.stripe_connect_account_id until the helper is
-- swapped to read this table, then the old column is dropped in a later
-- migration (1-release deprecation window).

CREATE TABLE IF NOT EXISTS "org_country_stripe_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "country_code" text NOT NULL,         -- ISO 3166-1 alpha-2 (MY, SG, TH, ...)
  "stripe_account_id" text UNIQUE,      -- acct_... (Standard via OAuth)
  "stripe_connect_status" text NOT NULL DEFAULT 'pending', -- pending | active | restricted | rejected
  "stripe_connect_account_type" text NOT NULL DEFAULT 'standard',
  "charges_enabled" boolean NOT NULL DEFAULT false,
  "payouts_enabled" boolean NOT NULL DEFAULT false,
  "details_submitted" boolean NOT NULL DEFAULT false,
  "currency" text NOT NULL,             -- MYR | SGD | THB | ...
  "stripe_connect_onboarding_completed_at" timestamp,
  "connect_account_updated_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_country_stripe_accounts_org_country_uq"
  ON "org_country_stripe_accounts" ("organization_id", "country_code");

CREATE INDEX IF NOT EXISTS "org_country_stripe_accounts_acct_idx"
  ON "org_country_stripe_accounts" ("stripe_account_id");
