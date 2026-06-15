-- Migration: 0081 — credit_point_ledger (F-CRM-02, best-guess loyalty redemption)
-- customer_profiles.credit_points was write-only: points could be stored but
-- never consumed, with no audit trail. This adds an append-only ledger so every
-- earn/redeem/adjust is recorded with a running balance_after. The authoritative
-- balance remains customer_profiles.credit_points; the ledger is the audit trail.
--
-- BEST-GUESS PRODUCT DECISION (review): redemption valuation is 1 point = 1 cent
-- of discount, applied at POS via an optional creditPointsToRedeem input, capped
-- at the customer's balance and the order subtotal. Adjust the rate/policy here
-- and in redeemCreditPoints() if product intends otherwise.
--
-- Idempotent: re-runs on partially-migrated tenants are safe.

CREATE TABLE IF NOT EXISTS "credit_point_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "customer_user_id" text NOT NULL,
  "delta" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "reason" text NOT NULL,
  "source_type" text,
  "source_id" uuid,
  "actor_user_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "credit_point_ledger_customer_idx"
  ON "credit_point_ledger" ("customer_user_id");
