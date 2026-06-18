-- Migration: 0077 — commission_cycle_configs
-- Adds per-(branch|tenant) commission cap cycle policy. Resolves the
-- S-cycle-window-alignment defect where the per-cycle commission cap used
-- UTC calendar-month bounds even when finance teams ran non-standard payout
-- windows (e.g. 22nd→22nd). The cap resolver picks the most-specific row
-- (branchId=X), falls back to the tenant-wide row (branchId IS NULL), and
-- finally to calendar-month if nothing is configured.
--
-- Idempotent: re-runs on partially-migrated tenants are safe.

CREATE TABLE IF NOT EXISTS "commission_cycle_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "branch_id" uuid REFERENCES "hierarchy_nodes"("id") ON DELETE CASCADE,
  "cycle_type" text NOT NULL,
  "anchor_day" integer,
  "updated_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- UNIQUE on branch_id coalesces NULL so we get at most one tenant-wide row
-- AND at most one row per branch. NULL UNIQUE works correctly in Postgres
-- (treats each NULL as distinct), so we need a partial unique index on the
-- tenant-wide case plus a regular unique index on the branch-specific case.
CREATE UNIQUE INDEX IF NOT EXISTS "commission_cycle_configs_branch_unique_idx"
  ON "commission_cycle_configs" ("branch_id")
  WHERE "branch_id" IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "commission_cycle_configs_tenant_unique_idx"
  ON "commission_cycle_configs" ((1))
  WHERE "branch_id" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "commission_cycle_configs_branch_idx"
  ON "commission_cycle_configs" ("branch_id");
--> statement-breakpoint

-- CHECK: cycle_type must be one of the supported values; anchor_day range
-- depends on cycle_type. Enforced at the DB layer so a typo can't silently
-- mis-anchor a finance period.
ALTER TABLE "commission_cycle_configs"
  DROP CONSTRAINT IF EXISTS "commission_cycle_configs_type_check";
--> statement-breakpoint

ALTER TABLE "commission_cycle_configs"
  ADD CONSTRAINT "commission_cycle_configs_type_check"
  CHECK (
    "cycle_type" IN ('calendar_month', 'monthly_anchored', 'semi_monthly', 'weekly')
    AND (
      ("cycle_type" = 'calendar_month' AND "anchor_day" IS NULL)
      OR ("cycle_type" = 'monthly_anchored' AND "anchor_day" BETWEEN 1 AND 28)
      OR ("cycle_type" = 'semi_monthly'    AND "anchor_day" BETWEEN 1 AND 15)
      OR ("cycle_type" = 'weekly'          AND "anchor_day" BETWEEN 0 AND 6)
    )
  );
