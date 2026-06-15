-- Tenant migration: trainer_availability_exceptions
-- One-off date-specific overrides to the recurring trainer schedule.
-- Idempotent: safe to re-run on partially migrated tenants.

CREATE TABLE IF NOT EXISTS trainer_availability_exceptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id  uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date        date NOT NULL,
  kind        trainer_availability_kind NOT NULL DEFAULT 'timeoff',
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text
);

CREATE UNIQUE INDEX IF NOT EXISTS trainer_availability_exc_trainer_date_uniq
  ON trainer_availability_exceptions(trainer_id, date);
