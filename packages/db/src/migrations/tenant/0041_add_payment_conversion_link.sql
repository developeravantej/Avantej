-- migration: 0041_add_payment_conversion_link
-- description: Agent 3.5 — §5 Phase 3: payments self-ref FK for walk-in → package conversion
--   Adds converted_from_payment_id (nullable, self-ref FK with ON DELETE SET NULL).
--   Used when a walk-in drop-in payment is converted to a package payment mid-session.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "converted_from_payment_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_converted_from_payment_id_fk"
    FOREIGN KEY ("converted_from_payment_id") REFERENCES "payments"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_converted_from_idx" ON "payments" ("converted_from_payment_id");
