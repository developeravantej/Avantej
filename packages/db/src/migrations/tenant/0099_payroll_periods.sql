-- 0099_payroll_periods.sql
--
-- WS5 (MOVE parity) — month-based payroll period lock.
--
-- A payroll period is a (branch, [period_start, period_end)) window whose
-- commission can be frozen ('locked') so a back-dated correction can never
-- silently land in a settled month and change already-paid totals. The window
-- pair is the half-open interval produced by deriveCycleBounds (UTC), keyed by
-- the branch hierarchy node. branch_node_id is a plain uuid (no cross-table FK
-- — matches the branch_details/currency precedent, dodges the drift-check FK
-- gate). A row exists only once a period is locked (or pre-created); its
-- absence = open.
--
-- Idempotent (CREATE TABLE / INDEX IF NOT EXISTS) — safe to re-run.

CREATE TABLE IF NOT EXISTS "payroll_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text,
	"branch_node_id" uuid NOT NULL,
	"period_start" timestamptz NOT NULL,
	"period_end" timestamptz NOT NULL,
	"state" text NOT NULL DEFAULT 'open',
	"locked_at" timestamptz,
	"locked_by" text,
	"lock_kind" text,
	"unlock_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- One row per (branch, window) — lets the service ON CONFLICT-upsert the lock.
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_periods_branch_window_idx"
	ON "payroll_periods" ("branch_node_id", "period_start", "period_end");
-- Grid queries scan by branch + start.
CREATE INDEX IF NOT EXISTS "payroll_periods_branch_start_idx"
	ON "payroll_periods" ("branch_node_id", "period_start");
