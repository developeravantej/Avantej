-- Migration: 0078 — partner_stripe_accounts capabilities
--
-- Populates the previously-orphan partner_stripe_accounts table with the
-- columns needed to track Stripe Connect capability state for individual
-- partners (coaches / trainers). Mirrors the columns on
-- org_country_stripe_accounts so the webhook handler can use the same
-- shape on a per-partner branch.
--
-- Per ADR-0001 v2 (MY platform restriction on Express/Custom), the same
-- Standard + OAuth flow used for org-level Connect is mirrored here for
-- partner-level Connect — this migration adds the columns the OAuth
-- callback + account.updated webhook need to read/write.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS for every column; partial unique
-- indexes for the (orgId, partnerId) shape are unchanged.

ALTER TABLE "partner_stripe_accounts"
  ADD COLUMN IF NOT EXISTS "country_code" text,
  ADD COLUMN IF NOT EXISTS "default_currency" text,
  ADD COLUMN IF NOT EXISTS "payouts_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "details_submitted" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requirements_currently_due" jsonb,
  ADD COLUMN IF NOT EXISTS "requirements_eventually_due" jsonb,
  ADD COLUMN IF NOT EXISTS "requirements_disabled_reason" text,
  ADD COLUMN IF NOT EXISTS "connect_account_updated_at" timestamptz;
--> statement-breakpoint

-- Backfill onboardingCompletedAt-equivalent gate on details_submitted for any
-- pre-existing rows (none expected — table was orphan — but defensive).
UPDATE "partner_stripe_accounts"
  SET "details_submitted" = true
  WHERE "onboarding_completed_at" IS NOT NULL AND "details_submitted" = false;
--> statement-breakpoint

-- Index for capability scans (e.g. "show me all partners ready to receive payouts").
CREATE INDEX IF NOT EXISTS "partner_stripe_accounts_payouts_enabled_idx"
  ON "partner_stripe_accounts" ("payouts_enabled");
