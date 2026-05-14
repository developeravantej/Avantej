-- Plan B Phase 2 — Direct Charge payment columns on appointments.
--
-- Adds Stripe Connect Direct-Charge tracking fields to existing appointments
-- table. No new payments table — Phase 2 is one-shot charge per appointment;
-- refund history + retry audit deferred to Phase 3.
--
-- Phase 4 readiness: stripe_connect_account_id_snapshot captures the acct ID
-- at charge time so historical rows stay valid when the account ID migrates
-- from organizations.stripe_connect_account_id to per-country
-- hierarchy_nodes.stripe_connect_account_id (Phase 4 ADR-pending).

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "currency" text NOT NULL DEFAULT 'MYR',
  ADD COLUMN IF NOT EXISTS "application_fee_amount" integer,
  ADD COLUMN IF NOT EXISTS "stripe_connect_account_id_snapshot" text,
  ADD COLUMN IF NOT EXISTS "stripe_payment_link_id" text,
  ADD COLUMN IF NOT EXISTS "payment_link_url" text,
  ADD COLUMN IF NOT EXISTS "paid_at" timestamp,
  ADD COLUMN IF NOT EXISTS "payment_failure_reason" text,
  ADD COLUMN IF NOT EXISTS "payment_method_type" text;
