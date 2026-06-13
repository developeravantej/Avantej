-- 0090_installments_original_due_date.sql
-- Adds original_due_date to installments so the UI can show both the original
-- schedule and the rescheduled date. Captured on the FIRST reschedule only
-- (COALESCE in the service layer), so it always reflects the plan's original date.
-- Idempotent: safe to re-run on partially-migrated tenants.

ALTER TABLE "installments"
	ADD COLUMN IF NOT EXISTS "original_due_date" timestamp with time zone;
