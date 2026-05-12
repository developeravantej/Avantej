-- migration: 0049_add_recurring_occurrence_unique_idx
-- description: Add a partial unique index on (recurring_parent_id, start_time) for appointments.
--   Prevents concurrent materialization from creating duplicate occurrence rows for the same
--   parent appointment + date. Partial (WHERE recurring_parent_id IS NOT NULL) so it only
--   applies to child (materialized occurrence) rows, not to parent or standalone appointments.
--   Zero downtime — CREATE UNIQUE INDEX IF NOT EXISTS is safe on existing data because
--   no recurring appointments exist yet.

CREATE UNIQUE INDEX IF NOT EXISTS "appointments_recurring_occurrence_unique_idx"
ON "appointments" ("recurring_parent_id", "start_time")
WHERE "recurring_parent_id" IS NOT NULL;
