-- migration: 0050_add_is_recurring_idx
-- description: Add an index on is_recurring for the appointments table.
--   Used by listAppointmentsWithRecurrence to efficiently find recurring
--   parent appointments when expanding virtual occurrences.
--   Zero downtime — CREATE INDEX IF NOT EXISTS is safe on existing data.

CREATE INDEX IF NOT EXISTS "appointments_is_recurring_idx"
ON "appointments" ("is_recurring");
