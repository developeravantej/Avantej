-- migration: 0048_supplier_invoice_new_cols
-- description: Add dispute, paid, and payment reference columns to supplier_invoices.
--   dispute_reason: text stored when finance disputes a matched/pending invoice
--   disputed_at:    timestamp of when the dispute was raised
--   paid_at:        timestamp of when finance marked the invoice as paid
--   paid_by:        cross-db member.userId who marked as paid
--   payment_reference: optional bank transfer reference for audit trail
-- All columns nullable — zero downtime, fully backward-compatible.

ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "dispute_reason" text;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "disputed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "paid_by" text;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "payment_reference" text;
