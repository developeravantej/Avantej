-- 0098_branch_company_tax_numbering.sql
--
-- WS3 (MOVE parity) — per-branch company/legal profile, per-branch/per-country
-- tax scoping, and opt-in gapless per-branch document numbering.
--
-- All changes are ADDITIVE and BACKWARD-COMPATIBLE:
--   * New branch_details columns are nullable — a branch with no profile behaves
--     exactly as before.
--   * tax_rates.country is nullable — org-global rates (country IS NULL) keep
--     working; resolveTaxRate falls through to the org isDefault as before, so
--     no branch can lose its rate (NO_TAX_RATE safety net preserved).
--   * branch_number_sequences is a NEW table; numbering only switches to
--     per-branch counters when a branch has an invoice/receipt prefix set,
--     otherwise the existing global tenant_*_seq sequences are used unchanged.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS) — safe to
-- re-run on partially-migrated tenants (0051–0063 duplicate lineage).

-- --- Branch company / legal / tax profile + numbering prefixes ---------------
ALTER TABLE "branch_details" ADD COLUMN IF NOT EXISTS "company_legal_name" text;
ALTER TABLE "branch_details" ADD COLUMN IF NOT EXISTS "registration_number" text;
ALTER TABLE "branch_details" ADD COLUMN IF NOT EXISTS "tax_id" text;
ALTER TABLE "branch_details" ADD COLUMN IF NOT EXISTS "invoice_prefix" text;
ALTER TABLE "branch_details" ADD COLUMN IF NOT EXISTS "receipt_prefix" text;
-- Plain uuid (no cross-table FK) — matches the branch_details.currency
-- precedent and avoids the drift-check FK gate. Points at tax_rates.id.
ALTER TABLE "branch_details" ADD COLUMN IF NOT EXISTS "branch_tax_rate_id" uuid;

-- Prefixes must be unique ACROSS branches: two branches sharing a prefix would
-- mint identical document numbers (each per-branch counter starts at 1) and
-- collide on the tenant-wide invoices.invoice_number / payments.payment_number
-- UNIQUE constraint, rolling back the sale. Partial unique (NULLs allowed —
-- most branches have no prefix) enforces it at the DB level, race-proof.
CREATE UNIQUE INDEX IF NOT EXISTS "branch_details_invoice_prefix_idx"
	ON "branch_details" ("invoice_prefix") WHERE "invoice_prefix" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "branch_details_receipt_prefix_idx"
	ON "branch_details" ("receipt_prefix") WHERE "receipt_prefix" IS NOT NULL;

-- --- Per-country tax scoping -------------------------------------------------
-- Canonical country key = lowercased country-node name (same key the WS1
-- currency map uses). NULL = org-global rate (today's behavior).
ALTER TABLE "tax_rates" ADD COLUMN IF NOT EXISTS "country" text;
CREATE INDEX IF NOT EXISTS "tax_rates_country_idx" ON "tax_rates" ("country");

-- --- Gapless per-branch document numbering ----------------------------------
CREATE TABLE IF NOT EXISTS "branch_number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"branch_node_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"next_seq" integer NOT NULL DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
-- One counter per (branch, doc type). The UNIQUE lets the numbering service
-- ON CONFLICT-upsert the row on a branch's first document.
CREATE UNIQUE INDEX IF NOT EXISTS "branch_number_sequences_branch_doc_idx"
	ON "branch_number_sequences" ("branch_node_id", "doc_type");
