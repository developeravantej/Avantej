-- Add reschedule_history JSONB column to appointments.
-- Append-only array of {from, to, at, by} entries written each time
-- an appointment transitions to 'rescheduled' status.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reschedule_history jsonb NOT NULL DEFAULT '[]'::jsonb;
