-- Move scheduling_type from services → service_categories

-- 1. Add column to service_categories
ALTER TABLE service_categories
  ADD COLUMN IF NOT EXISTS scheduling_type text NOT NULL DEFAULT 'appointment';

-- 2. Migrate existing data: set each category's scheduling_type from the majority of its services.
--    Guarded so re-runs on an already-migrated tenant (where services.scheduling_type was
--    dropped by step 3 of a prior run) are safe. Dynamic EXECUTE keeps the missing column
--    from being parsed when it no longer exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'scheduling_type'
  ) THEN
    EXECUTE $mig$
      UPDATE service_categories sc
      SET scheduling_type = COALESCE(
        (
          SELECT s.scheduling_type
          FROM services s
          WHERE s.category_id = sc.id
          GROUP BY s.scheduling_type
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ),
        'appointment'
      );
    $mig$;
  END IF;
END $$;

-- 3. Drop scheduling_type from services
ALTER TABLE services DROP COLUMN IF EXISTS scheduling_type;
DROP INDEX IF EXISTS services_scheduling_type_idx;
