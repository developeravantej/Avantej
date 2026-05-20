-- migration: 0056_payouts_gross_deductions
-- description: Add gross_amount_cents + deductions_cents to payouts, backfill gross from existing amount col.
--   Existing column is "amount" (integer cents, pre-tax commission).
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Add gross_amount_cents (nullable for safe backfill)
-- ============================================================
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "gross_amount_cents" integer;
--> statement-breakpoint

-- ============================================================
-- 2. Add deductions_cents (NOT NULL default 0)
-- ============================================================
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "deductions_cents" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- ============================================================
-- 3. Backfill gross_amount_cents from existing amount column
-- ============================================================
UPDATE "payouts"
SET "gross_amount_cents" = "amount"
WHERE "gross_amount_cents" IS NULL;
