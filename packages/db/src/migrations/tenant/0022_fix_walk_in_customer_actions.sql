-- migration: 0022_fix_walk_in_customer_actions
-- description: D1 drift fix — re-add walk_in_customer_id FKs with ON DELETE RESTRICT.
--   Source audit: zhub/shared/schema-missing-relationships.md
--   Tables: appointment_clients, package_instances

ALTER TABLE "appointment_clients"
  DROP CONSTRAINT IF EXISTS "appointment_clients_walk_in_customer_id_walk_in_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "appointment_clients"
  ADD CONSTRAINT "appointment_clients_walk_in_customer_id_walk_in_customers_id_fk"
  FOREIGN KEY ("walk_in_customer_id") REFERENCES "walk_in_customers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_instances"
  DROP CONSTRAINT IF EXISTS "package_instances_walk_in_customer_id_walk_in_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "package_instances"
  ADD CONSTRAINT "package_instances_walk_in_customer_id_walk_in_customers_id_fk"
  FOREIGN KEY ("walk_in_customer_id") REFERENCES "walk_in_customers"("id") ON DELETE restrict ON UPDATE no action;
