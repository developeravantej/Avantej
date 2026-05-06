CREATE TABLE "member_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"display_name" text,
	"bio" text,
	"specialization" text,
	"image_url" text,
	"phone_number" text,
	"certifications" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_profiles_member_id_unique" UNIQUE("member_id")
);
--> statement-breakpoint
CREATE TABLE "service_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_category_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"default_duration" integer,
	"default_max_attendees" integer,
	"incentive_type" text,
	"is_conditional" boolean DEFAULT false NOT NULL,
	"max_staff" integer DEFAULT 1 NOT NULL,
	"staff_pool_percentage" integer DEFAULT 100 NOT NULL,
	"staff_weightage" jsonb,
	"payment_structures" jsonb,
	"threshold" integer,
	"require_advance_booking" boolean DEFAULT false NOT NULL,
	"min_advance_hours" integer,
	"enable_cancellation_window" boolean DEFAULT false NOT NULL,
	"cancellation_cutoff_hours" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_category_config_category_id_unique" UNIQUE("category_id")
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"phone" text,
	"date_of_birth" timestamp,
	"gender" text,
	"address" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"medical_notes" text,
	"fitness_goals" text[],
	"credit_points" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"booking_reminders" boolean DEFAULT true NOT NULL,
	"booking_confirmations" boolean DEFAULT true NOT NULL,
	"promotional_emails" boolean DEFAULT true NOT NULL,
	"package_expiry" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"icon" text,
	"color" text,
	"related_id" uuid,
	"related_type" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"related_id" uuid,
	"related_type" text,
	"credits_change" integer DEFAULT 0 NOT NULL,
	"icon" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"source" text NOT NULL,
	"assigned_by" text,
	"purchase_number" text,
	"payment_id" uuid,
	"total_price" integer,
	"tax_amount" integer DEFAULT 0,
	"payment_status" text NOT NULL,
	"payment_method" text,
	"e_signature" text,
	"terms_agreed_at" timestamp,
	"credits_total" integer NOT NULL,
	"credits_remaining" integer NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"remark" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "package_instances_purchase_number_unique" UNIQUE("purchase_number")
);
--> statement-breakpoint
CREATE TABLE "preferred_times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_instance_id" uuid NOT NULL,
	"day_of_week" text NOT NULL,
	"time" text NOT NULL,
	"priority" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"capacity" integer NOT NULL,
	"spots_booked" integer DEFAULT 0 NOT NULL,
	"spots_available" integer NOT NULL,
	"is_full" boolean DEFAULT false NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"cancellation_reason" text,
	"instructor_id" uuid,
	"location" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_slot_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"status" text NOT NULL,
	"notified_at" timestamp,
	"expires_at" timestamp,
	"booked_at" timestamp,
	"appointment_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurrence_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"frequency_value" integer DEFAULT 1 NOT NULL,
	"time_unit" text NOT NULL,
	"repeat_on" jsonb,
	"monthly_type" text,
	"monthly_day_of_week" integer,
	"monthly_week_of_month" integer,
	"ends_type" text NOT NULL,
	"ends_after_occurrences" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recurrence_rules_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"target_audience" text DEFAULT 'all' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid,
	"submitted_by" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"receipt_url" text,
	"expense_date" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"rejection_reason" text,
	"paid_at" timestamp,
	"paid_by" text,
	"payment_reference" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"total_price" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN "description" text;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "title" text;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "description" text;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "image_url" text;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "type" text DEFAULT 'private' NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "price" integer;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "price_unit" text DEFAULT 'session';
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "taxable" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "tax_percentage" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "is_recommended" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "location" text;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "features" text[];
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "scheduling_type" text DEFAULT 'appointment' NOT NULL;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "booking_number" text;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "trainer_id" uuid;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "package_instance_id" uuid;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "credits_used" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "location" text;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cancelled_at" timestamp;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cancellation_reason" text;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "class_slot_id" uuid;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "description" text;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "image_url" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_number" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payment_method" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_at" timestamp;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_amount" integer;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failure_reason" text;
--> statement-breakpoint
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_members" ADD CONSTRAINT "service_members_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_members" ADD CONSTRAINT "service_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "service_category_config" ADD CONSTRAINT "service_category_config_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_instances" ADD CONSTRAINT "package_instances_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "package_instances" ADD CONSTRAINT "package_instances_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "preferred_times" ADD CONSTRAINT "preferred_times_package_instance_id_package_instances_id_fk" FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_instructor_id_members_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_class_slot_id_class_slots_id_fk" FOREIGN KEY ("class_slot_id") REFERENCES "public"."class_slots"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "member_profiles_member_idx" ON "member_profiles" USING btree ("member_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "service_members_unique_idx" ON "service_members" USING btree ("service_id","member_id");
--> statement-breakpoint
CREATE INDEX "service_members_service_idx" ON "service_members" USING btree ("service_id");
--> statement-breakpoint
CREATE INDEX "service_members_member_idx" ON "service_members" USING btree ("member_id");
--> statement-breakpoint
CREATE INDEX "service_category_config_category_idx" ON "service_category_config" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX "service_category_config_incentive_idx" ON "service_category_config" USING btree ("incentive_type");
--> statement-breakpoint
CREATE INDEX "customer_profiles_user_idx" ON "customer_profiles" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "customer_profiles_credits_idx" ON "customer_profiles" USING btree ("credit_points");
--> statement-breakpoint
CREATE INDEX "notification_preferences_user_idx" ON "notification_preferences" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("is_read");
--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id","is_read","created_at");
--> statement-breakpoint
CREATE INDEX "user_activity_log_user_idx" ON "user_activity_log" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "user_activity_log_type_idx" ON "user_activity_log" USING btree ("activity_type");
--> statement-breakpoint
CREATE INDEX "user_activity_log_user_created_idx" ON "user_activity_log" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "package_instances_package_idx" ON "package_instances" USING btree ("package_id");
--> statement-breakpoint
CREATE INDEX "package_instances_client_idx" ON "package_instances" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "package_instances_source_idx" ON "package_instances" USING btree ("source");
--> statement-breakpoint
CREATE INDEX "package_instances_status_idx" ON "package_instances" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "package_instances_payment_status_idx" ON "package_instances" USING btree ("payment_status");
--> statement-breakpoint
CREATE INDEX "package_instances_expires_idx" ON "package_instances" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "package_instances_client_status_idx" ON "package_instances" USING btree ("client_id","status");
--> statement-breakpoint
CREATE INDEX "package_instances_purchase_number_idx" ON "package_instances" USING btree ("purchase_number");
--> statement-breakpoint
CREATE INDEX "preferred_times_package_instance_idx" ON "preferred_times" USING btree ("package_instance_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "preferred_times_package_priority_idx" ON "preferred_times" USING btree ("package_instance_id","priority");
--> statement-breakpoint
CREATE INDEX "class_slots_service_idx" ON "class_slots" USING btree ("service_id");
--> statement-breakpoint
CREATE INDEX "class_slots_branch_idx" ON "class_slots" USING btree ("branch_id");
--> statement-breakpoint
CREATE INDEX "class_slots_date_idx" ON "class_slots" USING btree ("date");
--> statement-breakpoint
CREATE INDEX "class_slots_service_date_time_idx" ON "class_slots" USING btree ("service_id","date","start_time");
--> statement-breakpoint
CREATE INDEX "class_slots_available_idx" ON "class_slots" USING btree ("is_available","is_full","date");
--> statement-breakpoint
CREATE INDEX "class_slots_instructor_idx" ON "class_slots" USING btree ("instructor_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_slot_user_idx" ON "waitlist_entries" USING btree ("class_slot_id","user_id");
--> statement-breakpoint
CREATE INDEX "waitlist_entries_slot_idx" ON "waitlist_entries" USING btree ("class_slot_id");
--> statement-breakpoint
CREATE INDEX "waitlist_entries_user_idx" ON "waitlist_entries" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "waitlist_entries_status_idx" ON "waitlist_entries" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "waitlist_entries_slot_status_position_idx" ON "waitlist_entries" USING btree ("class_slot_id","status","position");
--> statement-breakpoint
CREATE INDEX "recurrence_rules_appointment_idx" ON "recurrence_rules" USING btree ("appointment_id");
--> statement-breakpoint
CREATE INDEX "announcements_branch_idx" ON "announcements" USING btree ("branch_id");
--> statement-breakpoint
CREATE INDEX "announcements_active_idx" ON "announcements" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX "announcements_priority_idx" ON "announcements" USING btree ("priority");
--> statement-breakpoint
CREATE INDEX "announcements_target_idx" ON "announcements" USING btree ("target_audience");
--> statement-breakpoint
CREATE INDEX "announcements_date_range_idx" ON "announcements" USING btree ("start_date","end_date");
--> statement-breakpoint
CREATE INDEX "announcements_active_visible_idx" ON "announcements" USING btree ("is_active","start_date","end_date");
--> statement-breakpoint
CREATE INDEX "expenses_branch_idx" ON "expenses" USING btree ("branch_id");
--> statement-breakpoint
CREATE INDEX "expenses_submitted_by_idx" ON "expenses" USING btree ("submitted_by");
--> statement-breakpoint
CREATE INDEX "expenses_status_idx" ON "expenses" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("expense_date");
--> statement-breakpoint
CREATE INDEX "expenses_submitter_status_idx" ON "expenses" USING btree ("submitted_by","status");
--> statement-breakpoint
CREATE INDEX "payment_items_payment_idx" ON "payment_items" USING btree ("payment_id");
--> statement-breakpoint
CREATE INDEX "payment_items_type_idx" ON "payment_items" USING btree ("item_type");
--> statement-breakpoint
CREATE INDEX "payment_items_item_idx" ON "payment_items" USING btree ("item_id");
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_trainer_id_members_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_package_instance_id_package_instances_id_fk" FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_class_slot_id_class_slots_id_fk" FOREIGN KEY ("class_slot_id") REFERENCES "public"."class_slots"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "services_type_idx" ON "services" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "services_recommended_idx" ON "services" USING btree ("is_recommended");
--> statement-breakpoint
CREATE INDEX "services_scheduling_type_idx" ON "services" USING btree ("scheduling_type");
--> statement-breakpoint
CREATE INDEX "appointments_booking_number_idx" ON "appointments" USING btree ("booking_number");
--> statement-breakpoint
CREATE INDEX "appointments_user_idx" ON "appointments" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "appointments_trainer_idx" ON "appointments" USING btree ("trainer_id");
--> statement-breakpoint
CREATE INDEX "appointments_package_instance_idx" ON "appointments" USING btree ("package_instance_id");
--> statement-breakpoint
CREATE INDEX "appointments_class_slot_idx" ON "appointments" USING btree ("class_slot_id");
--> statement-breakpoint
CREATE INDEX "appointments_user_status_idx" ON "appointments" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "payments_payment_number_idx" ON "payments" USING btree ("payment_number");
--> statement-breakpoint
CREATE INDEX "payments_payment_method_idx" ON "payments" USING btree ("payment_method");
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_booking_number_unique" UNIQUE("booking_number");
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_number_unique" UNIQUE("payment_number");
