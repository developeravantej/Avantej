-- migration: 0031_add_status_history
-- Agent 2.7 (Wave 3a) — per-entity status history tables
-- Brief reserved 0025 but that hash is taken (0025_member_sessions); plan reserved
-- 0028 but that hash is taken (0028_checkin_display_name); 0029 is taken
-- (0029_service_category_commission); 0030 was claimed by Agent 2.4 in this same
-- wave (0030_add_appointment_exclude_constraints). Next free slot is 0031.

CREATE TABLE IF NOT EXISTS "sales_order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "package_instance_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_instance_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointment_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"notes" text
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sales_order_status_history"
		ADD CONSTRAINT "sales_order_status_history_sales_order_id_fk"
		FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "payment_status_history"
		ADD CONSTRAINT "payment_status_history_payment_id_fk"
		FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "package_instance_status_history"
		ADD CONSTRAINT "package_instance_status_history_package_instance_id_fk"
		FOREIGN KEY ("package_instance_id") REFERENCES "package_instances"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "appointment_status_history"
		ADD CONSTRAINT "appointment_status_history_appointment_id_fk"
		FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_order_status_hist_entity_idx"
	ON "sales_order_status_history" ("sales_order_id", "changed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_status_hist_entity_idx"
	ON "payment_status_history" ("payment_id", "changed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "package_instance_status_hist_entity_idx"
	ON "package_instance_status_history" ("package_instance_id", "changed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointment_status_hist_entity_idx"
	ON "appointment_status_history" ("appointment_id", "changed_at");
