CREATE TABLE "package_instance_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_instance_id" uuid NOT NULL,
	"staff_id" text NOT NULL,
	"slot_index" integer DEFAULT 0 NOT NULL,
	"role" text DEFAULT 'trainer' NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "assigned_trainer_id" uuid;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "assigned_trainer_assigned_by" text;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "assigned_trainer_assigned_at" timestamp;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "package_instance_staff" ADD CONSTRAINT "package_instance_staff_package_instance_id_package_instances_id_fk" FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "package_instance_staff_unique_idx" ON "package_instance_staff" USING btree ("package_instance_id","staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "package_instance_staff_slot_unique_idx" ON "package_instance_staff" USING btree ("package_instance_id","slot_index");--> statement-breakpoint
CREATE INDEX "package_instance_staff_pkg_idx" ON "package_instance_staff" USING btree ("package_instance_id");--> statement-breakpoint
CREATE INDEX "package_instance_staff_staff_idx" ON "package_instance_staff" USING btree ("staff_id");