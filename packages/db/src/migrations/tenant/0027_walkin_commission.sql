-- Walk-in customer support for package_instances
ALTER TABLE package_instances ADD COLUMN IF NOT EXISTS walk_in_customer_id UUID REFERENCES walk_in_customers(id);
--> statement-breakpoint
ALTER TABLE package_instances ALTER COLUMN client_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE package_instances ADD CONSTRAINT pkg_owner_xor CHECK (
  (client_id IS NULL) <> (walk_in_customer_id IS NULL)
) NOT VALID;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pkg_instances_walk_in_idx ON package_instances(walk_in_customer_id);
--> statement-breakpoint
-- Walk-in customer linkage on appointment_clients
ALTER TABLE appointment_clients ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'member';
--> statement-breakpoint
ALTER TABLE appointment_clients ADD COLUMN IF NOT EXISTS walk_in_customer_id UUID REFERENCES walk_in_customers(id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS appt_clients_walk_in_idx ON appointment_clients(walk_in_customer_id);
--> statement-breakpoint
-- Commission percentage on services (basis points, e.g. 1000 = 10%)
ALTER TABLE services ADD COLUMN IF NOT EXISTS commission_percentage INTEGER NOT NULL DEFAULT 0;
