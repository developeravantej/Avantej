-- migration: 0030_add_appointment_exclude_constraints
-- description: J3 — DB-level guard on overlapping appointment bookings.
--
-- Phase 2 / Wave 3a / Agent 2.4. Pairs with the trainer EXCLUDE that already
-- shipped via 0026_pipeline_audit. This file:
--   1. (Re-)ensures the trainer overlap constraint is present, idempotently.
--      0026 added it, but on tenants where 0026 has not yet rolled out we
--      still want this guarantee. The pg_constraint guard makes this a
--      no-op everywhere it already exists.
--   2. Adds the matching room overlap constraint (new in this migration).
--
-- Notes for ops:
--   - `appointments.start_time` / `end_time` are plain `timestamp` columns
--     (no timezone), so we use `tsrange`, NOT `tstzrange`. Mismatching the
--     range type to the column type would error at constraint-check time.
--   - Status values are `'cancelled'` and `'no-show'` (hyphen, not underscore).
--   - `WHERE <col> IS NOT NULL` is required on the partial index because
--     trainer_id / room_id are nullable; a NULL would otherwise be treated
--     as "not equal" and would not collide, but excluding nulls keeps the
--     index lean.
--   - If a tenant DB already has overlapping rows, the `ALTER TABLE ... ADD
--     CONSTRAINT` will fail. Run `apps/server/scripts/check-appointment-overlaps.ts`
--     pre-deploy to detect and clean up.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_trainer_no_overlap'
  ) THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_trainer_no_overlap
      EXCLUDE USING GIST (
        trainer_id WITH =,
        tsrange(start_time, end_time, '[)') WITH &&
      )
      WHERE (status NOT IN ('cancelled', 'no-show') AND trainer_id IS NOT NULL);
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_room_no_overlap'
  ) THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_room_no_overlap
      EXCLUDE USING GIST (
        room_id WITH =,
        tsrange(start_time, end_time, '[)') WITH &&
      )
      WHERE (status NOT IN ('cancelled', 'no-show') AND room_id IS NOT NULL);
  END IF;
END $$;
