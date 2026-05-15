-- Plan B Phase 3c.1 — Payment Link columns on payments (POS online checkout).
--
-- Adds Stripe Payment Link tracking fields to the existing payments table so
-- POS sales recorded with paymentMethod="online" can store the generated
-- Stripe Payment Link URL + id + Connect acct snapshot. The webhook
-- (payment_intent.succeeded with metadata.type="sales_order") later flips
-- payments.status -> "succeeded" and cascades to invoices/sales_orders/
-- package_instances.
--
-- stripePaymentIntentId already has an index from the original payments
-- migration; no new indexes are needed here.

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "payment_link_url" text,
  ADD COLUMN IF NOT EXISTS "stripe_payment_link_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_connect_account_id_snapshot" text;
