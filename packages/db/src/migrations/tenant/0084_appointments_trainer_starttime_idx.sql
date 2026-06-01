-- migration: 0084_appointments_trainer_starttime_idx
-- description: Composite index on appointments(trainer_id, start_time).
--   Used by proposeSchedule conflict detection and computeAvailableSlots, which
--   query a trainer's appointments within a date range. Without this composite
--   index those lookups fall back to the single-column trainer_id index and then
--   filter start_time in memory, degrading on large tenants.
--   Idempotent — CREATE INDEX IF NOT EXISTS is safe to re-run on partially
--   migrated tenants.

CREATE INDEX IF NOT EXISTS "appointments_trainer_starttime_idx"
ON "appointments" ("trainer_id", "start_time");
