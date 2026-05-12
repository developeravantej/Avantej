-- migration: 0036_add_commission_reversals
-- description: Agent 2.9 — J5 refund→commission reversal chain.
--   * commission_split_reversals: chain rows linking refund → reversed split → payout adjustment
--   * Self-FK on reversed_by_reversal_id uses DEFERRABLE INITIALLY DEFERRED so a cycle of
--     reversals (X reverses Y, then Z reverses X) can be inserted in any order within a tx.
--     Drizzle's generator cannot emit DEFERRABLE — this migration is hand-rolled raw SQL.

CREATE TABLE IF NOT EXISTS "commission_split_reversals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reversed_split_id" uuid NOT NULL,
  "refund_id" uuid NOT NULL,
  "reversed_by_reversal_id" uuid,
  "payout_adjustment_id" uuid,
  "amount_cents" integer NOT NULL,
  "reason" text,
  "created_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commission_split_reversals" ADD CONSTRAINT "commission_split_reversals_reversed_split_id_fk"
    FOREIGN KEY ("reversed_split_id") REFERENCES "commission_splits"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commission_split_reversals" ADD CONSTRAINT "commission_split_reversals_refund_id_fk"
    FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- DEFERRABLE for cycle: self-FK on reversed_by_reversal_id
DO $$ BEGIN
  ALTER TABLE "commission_split_reversals"
    ADD CONSTRAINT "commission_split_reversals_reversed_by_reversal_id_fk"
    FOREIGN KEY ("reversed_by_reversal_id") REFERENCES "commission_split_reversals"("id") ON DELETE set null
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commission_split_reversals" ADD CONSTRAINT "commission_split_reversals_payout_adjustment_id_fk"
    FOREIGN KEY ("payout_adjustment_id") REFERENCES "payouts"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_split_reversals_refund_idx" ON "commission_split_reversals" ("refund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_split_reversals_split_idx" ON "commission_split_reversals" ("reversed_split_id");
--> statement-breakpoint
-- Assertion: verify the deferrable flag was actually set (Drizzle won't otherwise)
DO $$
DECLARE
  is_deferrable boolean;
BEGIN
  SELECT condeferrable INTO is_deferrable FROM pg_constraint
   WHERE conname = 'commission_split_reversals_reversed_by_reversal_id_fk';
  IF is_deferrable IS NULL OR NOT is_deferrable THEN
    RAISE EXCEPTION 'DEFERRABLE flag missing on commission_split_reversals_reversed_by_reversal_id_fk';
  END IF;
END$$;
