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
CREATE SEQUENCE IF NOT EXISTS tenant_sales_order_seq START 1 INCREMENT 1;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS tenant_payment_seq START 1 INCREMENT 1;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS tenant_invoice_seq START 1 INCREMENT 1;
