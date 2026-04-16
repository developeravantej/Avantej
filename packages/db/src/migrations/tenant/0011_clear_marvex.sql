CREATE TABLE "member_category_buffer_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"buffer_time_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_service_buffer_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"buffer_time_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "google_calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"google_email" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"sync_scope" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_calendar_event_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "google_calendar_event_id" text;--> statement-breakpoint
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
ALTER TABLE "member_category_buffer_overrides" ADD CONSTRAINT "member_category_buffer_overrides_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_category_buffer_overrides" ADD CONSTRAINT "member_category_buffer_overrides_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_service_buffer_overrides" ADD CONSTRAINT "member_service_buffer_overrides_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_service_buffer_overrides" ADD CONSTRAINT "member_service_buffer_overrides_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_package_instance_id_package_instances_id_fk" FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_events" ADD CONSTRAINT "installment_events_package_instance_id_package_instances_id_fk" FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_events" ADD CONSTRAINT "installment_events_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_mappings" ADD CONSTRAINT "google_calendar_event_mappings_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_mappings" ADD CONSTRAINT "google_calendar_event_mappings_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcbo_member_category_unique_idx" ON "member_category_buffer_overrides" USING btree ("member_id","category_id");--> statement-breakpoint
CREATE INDEX "mcbo_member_idx" ON "member_category_buffer_overrides" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "mcbo_category_idx" ON "member_category_buffer_overrides" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "msbo_member_service_unique_idx" ON "member_service_buffer_overrides" USING btree ("member_id","service_id");--> statement-breakpoint
CREATE INDEX "msbo_member_idx" ON "member_service_buffer_overrides" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "msbo_service_idx" ON "member_service_buffer_overrides" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "installments_package_instance_idx" ON "installments" USING btree ("package_instance_id");--> statement-breakpoint
CREATE INDEX "installments_status_idx" ON "installments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "installments_due_date_idx" ON "installments" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "installments_package_number_unq" ON "installments" USING btree ("package_instance_id","installment_number");--> statement-breakpoint
CREATE INDEX "installment_events_package_idx" ON "installment_events" USING btree ("package_instance_id");--> statement-breakpoint
CREATE INDEX "installment_events_type_idx" ON "installment_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "installment_events_created_idx" ON "installment_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_settings_key_idx" ON "organization_settings" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "gcal_connections_member_idx" ON "google_calendar_connections" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "gcal_connections_active_idx" ON "google_calendar_connections" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "gcal_connections_scope_idx" ON "google_calendar_connections" USING btree ("sync_scope");--> statement-breakpoint
CREATE UNIQUE INDEX "gcal_event_map_appt_conn_idx" ON "google_calendar_event_mappings" USING btree ("appointment_id","connection_id");--> statement-breakpoint
CREATE INDEX "gcal_event_map_appt_idx" ON "google_calendar_event_mappings" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "gcal_event_map_conn_idx" ON "google_calendar_event_mappings" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "package_instances_is_locked_idx" ON "package_instances" USING btree ("is_locked");--> statement-breakpoint
CREATE INDEX "package_instances_next_due_date_idx" ON "package_instances" USING btree ("next_due_date");--> statement-breakpoint
ALTER TABLE "service_members" DROP COLUMN "buffer_time_minutes";