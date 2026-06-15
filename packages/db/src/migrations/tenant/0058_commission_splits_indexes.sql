-- migration: 0058_commission_splits_indexes
-- description: Add composite indexes for commission_splits staff+status queries.
--   Actual column names: staff_id, status, calculated_amount (verified from schema).
--   staffStatusEarnedIdx (staff_id, status, earned_at) already exists from prior migration.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. staff + status composite (lookup by staff for a given status)
-- ============================================================
CREATE INDEX IF NOT EXISTS "commission_splits_staff_status_idx"
	ON "commission_splits" ("staff_id", "status");
--> statement-breakpoint

-- ============================================================
-- 2. staff + status + calculated_amount (liability / payroll aggregate)
-- ============================================================
CREATE INDEX IF NOT EXISTS "commission_splits_staff_status_amount_idx"
	ON "commission_splits" ("staff_id", "status", "calculated_amount");
