-- Plan C Wave 1 — Payment integrity foundation tables.
--
-- Four new control-panel tables supporting:
--   - C.2 dispute handler (platform_dispute_queue)
--   - C.5 nightly reconciler (reconciliation_runs, payment_drift_log,
--     reconciliation_state)
--
-- platform_payment_ledger already exists from Plan A — C.7 wires writes
-- in a separate commit.

-- ── platform_dispute_queue (C.2) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "platform_dispute_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "stripe_account_id" text NOT NULL,
  "dispute_id" text NOT NULL UNIQUE,        -- dp_...
  "status" text NOT NULL,                    -- warning_needs_response | needs_response | under_review | won | lost | charge_refunded
  "amount" integer NOT NULL,                 -- minor units
  "currency" text NOT NULL,
  "reason" text,                             -- fraudulent | duplicate | requested_by_customer | etc.
  "deadline_at" timestamp,                   -- Stripe evidence deadline
  "handled_at" timestamp,
  "handled_by" text,                         -- platform admin user id
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "dispute_queue_org_idx" ON "platform_dispute_queue" ("organization_id");
CREATE INDEX IF NOT EXISTS "dispute_queue_status_idx" ON "platform_dispute_queue" ("status");
CREATE INDEX IF NOT EXISTS "dispute_queue_deadline_idx" ON "platform_dispute_queue" ("deadline_at");

-- ── reconciliation_runs (C.5) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reconciliation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_started_at" timestamp NOT NULL,
  "run_completed_at" timestamp,
  "status" text NOT NULL,                    -- running | completed | failed
  "drift_count" integer NOT NULL DEFAULT 0,
  "error" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- ── payment_drift_log (C.5) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payment_drift_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL REFERENCES "reconciliation_runs"("id") ON DELETE CASCADE,
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
  "stripe_account_id" text,
  "resource_type" text NOT NULL,             -- charge | refund | payout | application_fee
  "resource_id" text NOT NULL,               -- ch_/re_/po_/fee_ id
  "severity" text NOT NULL,                  -- info | warn | critical
  "drift_kind" text NOT NULL,                -- missing_in_db | status_mismatch | amount_mismatch | currency_mismatch | ...
  "stripe_value" jsonb,
  "db_value" jsonb,
  "detected_at" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp,
  "resolved_by" text                         -- platform admin user id
);
CREATE INDEX IF NOT EXISTS "drift_run_idx" ON "payment_drift_log" ("run_id");
CREATE INDEX IF NOT EXISTS "drift_org_idx" ON "payment_drift_log" ("organization_id");
CREATE INDEX IF NOT EXISTS "drift_severity_idx" ON "payment_drift_log" ("severity");
CREATE INDEX IF NOT EXISTS "drift_unresolved_idx" ON "payment_drift_log" ("severity")
  WHERE "resolved_at" IS NULL;

-- ── reconciliation_state (C.5) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reconciliation_state" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "country_code" text NOT NULL,
  "resource_type" text NOT NULL,
  "last_reconciled_at" timestamp NOT NULL,
  PRIMARY KEY ("organization_id", "country_code", "resource_type")
);
