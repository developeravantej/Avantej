-- 0100_billing_documents (branded invoice/receipt print views)
-- org_billing_profile: singleton per tenant — legal identity printed on
-- invoices/receipts (legal name, SSM reg no, address, footer note, logo in R2).
-- receipts: one receipt per invoice, stable RCP number, payment lines
-- snapshotted as jsonb and re-snapshotted (same number) when the paid set
-- changes. tenant_receipt_seq feeds RCP-YYYYMMDD-NNNNNN numbering.
-- Idempotent — safe to re-run on partially migrated tenant branches.

CREATE TABLE IF NOT EXISTS "org_billing_profile" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"legal_name" text,
	"registration_no" text,
	"address" text,
	"footer_note" text,
	"logo_key" text,
	"logo_content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "org_billing_profile"
		ADD CONSTRAINT "org_billing_profile_singleton_check" CHECK ("id" = 'singleton');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_number" text NOT NULL,
	"invoice_id" uuid,
	"invoice_number" text,
	"branch_id" uuid,
	"date" timestamp with time zone NOT NULL,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"total_amount" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "receipts"
		ADD CONSTRAINT "receipts_receipt_number_unique" UNIQUE ("receipt_number");
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	ALTER TABLE "receipts"
		ADD CONSTRAINT "receipts_invoice_id_invoices_id_fk"
		FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- One receipt per invoice (stable number; lines refresh in place).
CREATE UNIQUE INDEX IF NOT EXISTS "receipts_invoice_unique"
	ON "receipts" ("invoice_id");
CREATE INDEX IF NOT EXISTS "receipts_branch_idx"
	ON "receipts" ("branch_id");

CREATE SEQUENCE IF NOT EXISTS "tenant_receipt_seq";
