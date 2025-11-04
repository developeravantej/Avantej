CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"branch_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"duration" integer NOT NULL,
	"duration_unit_type" text DEFAULT 'minutes' NOT NULL,
	"max_attendees" integer NOT NULL,
	"attendance_threshold" integer,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"stripe_sync_status" text DEFAULT 'pending' NOT NULL,
	"stripe_last_synced_at" timestamp,
	"branch_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_commission_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"commission_type" text NOT NULL,
	"fixed_amounts" jsonb,
	"staff_pool_percentage" integer DEFAULT 100 NOT NULL,
	"position_weightage" jsonb,
	"max_staff" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_commission_config_service_id_unique" UNIQUE("service_id")
);
--> statement-breakpoint
CREATE TABLE "service_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"require_advance_booking" boolean DEFAULT false NOT NULL,
	"min_advance_booking_duration" integer,
	"min_advance_booking_unit_type" text DEFAULT 'hours',
	"enable_cancellation_window" boolean DEFAULT false NOT NULL,
	"cancellation_cutoff_duration" integer,
	"cancellation_cutoff_unit_type" text DEFAULT 'hours',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_rules_service_id_unique" UNIQUE("service_id")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"appointment_type" text NOT NULL,
	"cross_usage_enabled" boolean DEFAULT false NOT NULL,
	"session_count" integer NOT NULL,
	"price_per_session" integer NOT NULL,
	"max_clients_per_session" integer NOT NULL,
	"expiry_days" integer,
	"expiry_date" timestamp,
	"auto_generate_invoice" boolean DEFAULT false NOT NULL,
	"branch_id" uuid,
	"allowed_service_ids" jsonb,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"sessions_remaining" integer NOT NULL,
	"sessions_used" integer DEFAULT 0 NOT NULL,
	"expiry_date" timestamp NOT NULL,
	"payment_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"start_time" timestamp NOT NULL,
	"duration" integer NOT NULL,
	"end_time" timestamp NOT NULL,
	"service_id" uuid,
	"branch_id" uuid NOT NULL,
	"status" text NOT NULL,
	"session_total" integer NOT NULL,
	"price_per_client" integer NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurring_parent_id" uuid,
	"recurring_frequency" text,
	"recurring_end_date" timestamp,
	"conflict_resolved" boolean DEFAULT false NOT NULL,
	"conflict_reason" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"stripe_payment_intent_id" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"package_assignment_id" uuid,
	"price_paid" integer NOT NULL,
	"attended" boolean,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"staff_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"staff_id" text NOT NULL,
	"split_percentage" integer NOT NULL,
	"calculated_amount" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_payment_intent_id" text NOT NULL,
	"stripe_charge_id" text,
	"customer_id" text NOT NULL,
	"stripe_customer_id" text,
	"amount" integer NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"platform_fee_amount" integer DEFAULT 0 NOT NULL,
	"platform_fee_percentage" integer DEFAULT 0 NOT NULL,
	"franchiser_amount" integer NOT NULL,
	"status" text NOT NULL,
	"appointment_id" uuid,
	"description" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "partner_stripe_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" text NOT NULL,
	"stripe_connect_account_id" text NOT NULL,
	"stripe_connect_status" text DEFAULT 'pending' NOT NULL,
	"stripe_connect_account_type" text DEFAULT 'partner' NOT NULL,
	"onboarding_url" text,
	"onboarding_completed_at" timestamp,
	"bank_account_last_4" text,
	"bank_account_type" text,
	"account_type" text DEFAULT 'express' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partner_stripe_accounts_stripe_connect_account_id_unique" UNIQUE("stripe_connect_account_id")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_transfer_id" text,
	"stripe_payout_id" text,
	"recipient_id" text NOT NULL,
	"stripe_connect_account_id" text,
	"appointment_id" uuid NOT NULL,
	"commission_split_id" uuid,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"payout_method" text NOT NULL,
	"bank_account_last_4" text,
	"manual_payout_confirmed_at" timestamp,
	"manual_payout_confirmed_by" text,
	"status" text NOT NULL,
	"scheduled_at" timestamp,
	"paid_at" timestamp,
	"description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_commission_config" ADD CONSTRAINT "service_commission_config_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_rules" ADD CONSTRAINT "service_rules_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_assignments" ADD CONSTRAINT "package_assignments_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_recurring_parent_id_appointments_id_fk" FOREIGN KEY ("recurring_parent_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_clients" ADD CONSTRAINT "appointment_clients_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_clients" ADD CONSTRAINT "appointment_clients_package_assignment_id_package_assignments_id_fk" FOREIGN KEY ("package_assignment_id") REFERENCES "public"."package_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_staff" ADD CONSTRAINT "appointment_staff_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_stripe_accounts" ADD CONSTRAINT "partner_stripe_accounts_partner_id_members_user_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."members"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_commission_split_id_commission_splits_id_fk" FOREIGN KEY ("commission_split_id") REFERENCES "public"."commission_splits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_categories_branch_idx" ON "service_categories" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "service_categories_active_idx" ON "service_categories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "service_categories_order_idx" ON "service_categories" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "services_branch_idx" ON "services" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "services_stripe_product_idx" ON "services" USING btree ("stripe_product_id");--> statement-breakpoint
CREATE INDEX "services_stripe_sync_status_idx" ON "services" USING btree ("stripe_sync_status");--> statement-breakpoint
CREATE INDEX "services_active_idx" ON "services" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "service_commission_config_service_idx" ON "service_commission_config" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "service_rules_service_idx" ON "service_rules" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "packages_branch_idx" ON "packages" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "packages_appointment_type_idx" ON "packages" USING btree ("appointment_type");--> statement-breakpoint
CREATE INDEX "packages_archived_idx" ON "packages" USING btree ("is_archived");--> statement-breakpoint
CREATE INDEX "package_assignments_package_idx" ON "package_assignments" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "package_assignments_client_idx" ON "package_assignments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "package_assignments_expiry_idx" ON "package_assignments" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "package_assignments_client_expiry_idx" ON "package_assignments" USING btree ("client_id","expiry_date");--> statement-breakpoint
CREATE INDEX "appointments_branch_idx" ON "appointments" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "appointments_service_idx" ON "appointments" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "appointments_start_time_idx" ON "appointments" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "appointments_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appointments_type_idx" ON "appointments" USING btree ("type");--> statement-breakpoint
CREATE INDEX "appointments_recurring_idx" ON "appointments" USING btree ("recurring_parent_id");--> statement-breakpoint
CREATE INDEX "appointments_stripe_payment_idx" ON "appointments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "appointments_start_time_status_idx" ON "appointments" USING btree ("start_time","status");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_clients_unique_idx" ON "appointment_clients" USING btree ("appointment_id","client_id");--> statement-breakpoint
CREATE INDEX "appointment_clients_appointment_idx" ON "appointment_clients" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "appointment_clients_client_idx" ON "appointment_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "appointment_clients_package_idx" ON "appointment_clients" USING btree ("package_assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_staff_unique_idx" ON "appointment_staff" USING btree ("appointment_id","staff_id");--> statement-breakpoint
CREATE INDEX "appointment_staff_appointment_idx" ON "appointment_staff" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "appointment_staff_staff_idx" ON "appointment_staff" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_splits_unique_idx" ON "commission_splits" USING btree ("appointment_id","staff_id");--> statement-breakpoint
CREATE INDEX "commission_splits_appointment_idx" ON "commission_splits" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "commission_splits_staff_idx" ON "commission_splits" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "payments_stripe_pi_idx" ON "payments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "payments_stripe_charge_idx" ON "payments" USING btree ("stripe_charge_id");--> statement-breakpoint
CREATE INDEX "payments_customer_idx" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_appointment_idx" ON "payments" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_customer_status_idx" ON "payments" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "partner_stripe_accounts_partner_idx" ON "partner_stripe_accounts" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_stripe_accounts_stripe_idx" ON "partner_stripe_accounts" USING btree ("stripe_connect_account_id");--> statement-breakpoint
CREATE INDEX "partner_stripe_accounts_status_idx" ON "partner_stripe_accounts" USING btree ("stripe_connect_status");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_stripe_accounts_partner_unique_idx" ON "partner_stripe_accounts" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "payouts_recipient_idx" ON "payouts" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "payouts_appointment_idx" ON "payouts" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "payouts_commission_split_idx" ON "payouts" USING btree ("commission_split_id");--> statement-breakpoint
CREATE INDEX "payouts_stripe_transfer_idx" ON "payouts" USING btree ("stripe_transfer_id");--> statement-breakpoint
CREATE INDEX "payouts_stripe_payout_idx" ON "payouts" USING btree ("stripe_payout_id");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payouts_payout_method_idx" ON "payouts" USING btree ("payout_method");--> statement-breakpoint
CREATE INDEX "payouts_recipient_status_idx" ON "payouts" USING btree ("recipient_id","status");