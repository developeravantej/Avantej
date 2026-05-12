ALTER TABLE "package_instances" ADD COLUMN "payment_plan_type" text;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "installments_total" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "installments_paid" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "credits_unlocked" integer;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "next_due_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "grace_period_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "locked_reason" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "available_payment_plans" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "installment_interval_days" integer DEFAULT 30;--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_instance_id" uuid NOT NULL,
	"installment_number" integer NOT NULL,
	"amount" integer NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"payment_method" text,
	"confirmed_by" text,
	"credits_unlocked_by_this" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_instance_id" uuid NOT NULL,
	"installment_id" uuid,
	"event_type" text NOT NULL,
	"actor_id" text,
	"amount" integer,
	"reason" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_package_instance_id_package_instances_id_fk" FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_events" ADD CONSTRAINT "installment_events_package_instance_id_package_instances_id_fk" FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_events" ADD CONSTRAINT "installment_events_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "installments_package_instance_idx" ON "installments" USING btree ("package_instance_id");--> statement-breakpoint
CREATE INDEX "installments_status_idx" ON "installments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "installments_due_date_idx" ON "installments" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "installments_package_number_unq" ON "installments" USING btree ("package_instance_id","installment_number");--> statement-breakpoint
CREATE INDEX "installment_events_package_idx" ON "installment_events" USING btree ("package_instance_id");--> statement-breakpoint
CREATE INDEX "installment_events_type_idx" ON "installment_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "installment_events_created_idx" ON "installment_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_settings_key_idx" ON "organization_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "package_instances_is_locked_idx" ON "package_instances" USING btree ("is_locked");--> statement-breakpoint
CREATE INDEX "package_instances_next_due_date_idx" ON "package_instances" USING btree ("next_due_date");
