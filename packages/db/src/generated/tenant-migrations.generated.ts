// AUTO-GENERATED — do not edit. Run `bun gen:migrations` to regenerate.
// Source: packages/db/src/migrations/tenant/*.sql
// Order: HISTORICAL_ORDER in scripts/gen-tenant-migrations.ts, then newer files lex by filename.

export const TENANT_MIGRATIONS = [
	{ hash: "0000_noisy_aqueduct", sql: `CREATE TABLE "hierarchy_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" uuid,
	"depth" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"hierarchy_scope_id" uuid NOT NULL,
	"status" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"invited_by" text NOT NULL,
	"role" text NOT NULL,
	"hierarchy_scope_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD CONSTRAINT "hierarchy_nodes_parent_id_hierarchy_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_hierarchy_scope_id_hierarchy_nodes_id_fk" FOREIGN KEY ("hierarchy_scope_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_hierarchy_scope_id_hierarchy_nodes_id_fk" FOREIGN KEY ("hierarchy_scope_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hierarchy_parent_idx" ON "hierarchy_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "hierarchy_type_idx" ON "hierarchy_nodes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "hierarchy_depth_idx" ON "hierarchy_nodes" USING btree ("depth");--> statement-breakpoint
CREATE UNIQUE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "members_hierarchy_idx" ON "members" USING btree ("hierarchy_scope_id");--> statement-breakpoint
CREATE INDEX "members_role_idx" ON "members" USING btree ("role");--> statement-breakpoint
CREATE INDEX "members_status_idx" ON "members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invitations_email_status_idx" ON "invitations" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "invitations_expires_idx" ON "invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "invitations_invited_by_idx" ON "invitations" USING btree ("invited_by");` },
	{ hash: "0001_salty_morlocks", sql: `CREATE TABLE "service_categories" (
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
CREATE INDEX "payouts_recipient_status_idx" ON "payouts" USING btree ("recipient_id","status");` },
	{ hash: "0002_calm_martin_li", sql: `CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"priority" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_resource_action_unique" UNIQUE("resource","action")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_permission_unique" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN "pic_user_id" text;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roles_name_idx" ON "roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "roles_priority_idx" ON "roles" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "permissions_resource_idx" ON "permissions" USING btree ("resource");--> statement-breakpoint
CREATE INDEX "role_permissions_role_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "hierarchy_pic_user_idx" ON "hierarchy_nodes" USING btree ("pic_user_id");` },
	{ hash: "0003_green_runaways", sql: `ALTER TABLE "hierarchy_nodes" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "hierarchy_deleted_at_idx" ON "hierarchy_nodes" USING btree ("deleted_at");` },
	{ hash: "0004_remove_soft_delete", sql: `ALTER TABLE "hierarchy_nodes" DROP COLUMN IF EXISTS "deleted_at";--> statement-breakpoint
DROP INDEX IF EXISTS "hierarchy_deleted_at_idx";
` },
	{ hash: "0005_schema_enhancement", sql: `CREATE TABLE "member_profiles" (
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
` },
	{ hash: "0005_confused_hitman", sql: `CREATE TABLE "ghl_contact_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ghl_contact_id" text NOT NULL,
	"user_id" text NOT NULL,
	"customer_profile_id" uuid,
	"sync_status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ghl_sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"ghl_contact_id" text,
	"email" text,
	"status" text NOT NULL,
	"error_message" text,
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "deleted_source" text;--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD CONSTRAINT "ghl_contact_links_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_contact_links_ghl_contact_id_unique" ON "ghl_contact_links" USING btree ("ghl_contact_id");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_user_idx" ON "ghl_contact_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_customer_profile_idx" ON "ghl_contact_links" USING btree ("customer_profile_id");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_sync_status_idx" ON "ghl_contact_links" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "ghl_contact_links_last_synced_idx" ON "ghl_contact_links" USING btree ("last_synced_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_sync_events_event_key_unique" ON "ghl_sync_events" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "ghl_sync_events_event_type_idx" ON "ghl_sync_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "ghl_sync_events_contact_idx" ON "ghl_sync_events" USING btree ("ghl_contact_id");--> statement-breakpoint
CREATE INDEX "ghl_sync_events_status_idx" ON "ghl_sync_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ghl_sync_events_created_idx" ON "ghl_sync_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_profiles_is_deleted_idx" ON "customer_profiles" USING btree ("is_deleted");` },
	{ hash: "0006_robust_titania", sql: `CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"capacity" integer NOT NULL,
	"branch_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_number" text NOT NULL,
	"date" timestamp NOT NULL,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"created_by" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_amount" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sales_orders_sales_order_number_unique" UNIQUE("sales_order_number")
);
--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"product_id" uuid,
	"service_id" uuid,
	"appointment_id" uuid,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"total_price" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"sales_order_id" uuid,
	"payment_id" uuid,
	"date" timestamp NOT NULL,
	"due_date" timestamp,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"created_by" text NOT NULL,
	"payment_mode" text,
	"total_amount" integer NOT NULL,
	"amount_paid" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"e_invoice_status" text,
	"e_invoice_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "cancelled_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cancellation_number" text NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"invoice_id" uuid,
	"cancellation_date" timestamp NOT NULL,
	"cancelled_amount" integer NOT NULL,
	"cancellation_reason" text,
	"cancelled_by" text NOT NULL,
	"customer_id" text,
	"customer_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cancelled_sales_cancellation_number_unique" UNIQUE("cancellation_number")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"external_code" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_name_unique" UNIQUE("name"),
	CONSTRAINT "product_categories_external_code_unique" UNIQUE("external_code")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"account_number" text,
	"payment_terms" text,
	"contact_person" text,
	"contact_phone" text,
	"office_phone" text,
	"email" text,
	"website" text,
	"barcode" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units_of_measure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_uom_id" uuid,
	"conversion_factor" numeric(12, 4) DEFAULT '1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uom_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"barcode" text,
	"type" text DEFAULT 'product' NOT NULL,
	"brand_id" uuid,
	"category_id" uuid,
	"supplier_id" uuid,
	"uom_id" uuid NOT NULL,
	"conversion_factor" numeric(12, 4) DEFAULT '1' NOT NULL,
	"price" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "product_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"min_stock_level" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_stock_product_branch_unique" UNIQUE("product_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "stock_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" text NOT NULL,
	"date_issued" timestamp NOT NULL,
	"issued_by_member_id" uuid NOT NULL,
	"from_branch_id" uuid,
	"to_branch_id" uuid NOT NULL,
	"destination_label" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_requests_request_number_unique" UNIQUE("request_number")
);
--> statement-breakpoint
CREATE TABLE "stock_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_request_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_requested" integer NOT NULL,
	"quantity_fulfilled" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_number" text NOT NULL,
	"date_issued" timestamp NOT NULL,
	"from_branch_id" uuid NOT NULL,
	"to_branch_id" uuid NOT NULL,
	"issued_by_member_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transfer_orders_transfer_number_unique" UNIQUE("transfer_number")
);
--> statement-breakpoint
CREATE TABLE "transfer_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_transferred" integer NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN "scope" text DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "e_invoice_status" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "e_invoice_id" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancelled_sales" ADD CONSTRAINT "cancelled_sales_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancelled_sales" ADD CONSTRAINT "cancelled_sales_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_base_uom_id_units_of_measure_id_fk" FOREIGN KEY ("base_uom_id") REFERENCES "public"."units_of_measure"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_uom_id_units_of_measure_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."units_of_measure"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_issued_by_member_id_members_id_fk" FOREIGN KEY ("issued_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_from_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_requests" ADD CONSTRAINT "stock_requests_to_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_request_items" ADD CONSTRAINT "stock_request_items_stock_request_id_stock_requests_id_fk" FOREIGN KEY ("stock_request_id") REFERENCES "public"."stock_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_request_items" ADD CONSTRAINT "stock_request_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_from_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_to_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_orders" ADD CONSTRAINT "transfer_orders_issued_by_member_id_members_id_fk" FOREIGN KEY ("issued_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_order_items" ADD CONSTRAINT "transfer_order_items_transfer_order_id_transfer_orders_id_fk" FOREIGN KEY ("transfer_order_id") REFERENCES "public"."transfer_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_order_items" ADD CONSTRAINT "transfer_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rooms_branch_idx" ON "rooms" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "rooms_is_active_idx" ON "rooms" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sales_orders_number_idx" ON "sales_orders" USING btree ("sales_order_number");--> statement-breakpoint
CREATE INDEX "sales_orders_customer_idx" ON "sales_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sales_orders_created_by_idx" ON "sales_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "sales_orders_branch_idx" ON "sales_orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "sales_orders_date_idx" ON "sales_orders" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sales_orders_status_idx" ON "sales_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sales_order_items_order_idx" ON "sales_order_items" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "sales_order_items_product_idx" ON "sales_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sales_order_items_service_idx" ON "sales_order_items" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "sales_order_items_appointment_idx" ON "sales_order_items" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "invoices_number_idx" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_sales_order_idx" ON "invoices" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "invoices_payment_idx" ON "invoices" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_e_invoice_status_idx" ON "invoices" USING btree ("e_invoice_status");--> statement-breakpoint
CREATE INDEX "invoices_date_idx" ON "invoices" USING btree ("date");--> statement-breakpoint
CREATE INDEX "cancelled_sales_number_idx" ON "cancelled_sales" USING btree ("cancellation_number");--> statement-breakpoint
CREATE INDEX "cancelled_sales_order_idx" ON "cancelled_sales" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "cancelled_sales_customer_idx" ON "cancelled_sales" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cancelled_sales_date_idx" ON "cancelled_sales" USING btree ("cancellation_date");--> statement-breakpoint
CREATE INDEX "brands_name_idx" ON "brands" USING btree ("name");--> statement-breakpoint
CREATE INDEX "product_categories_name_idx" ON "product_categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "product_categories_external_code_idx" ON "product_categories" USING btree ("external_code");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "suppliers_is_active_idx" ON "suppliers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "uom_name_idx" ON "units_of_measure" USING btree ("name");--> statement-breakpoint
CREATE INDEX "uom_base_uom_idx" ON "units_of_measure" USING btree ("base_uom_id");--> statement-breakpoint
CREATE INDEX "products_sku_idx" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_barcode_idx" ON "products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_supplier_idx" ON "products" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_stock_product_idx" ON "product_stock" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_stock_branch_idx" ON "product_stock" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "stock_requests_number_idx" ON "stock_requests" USING btree ("request_number");--> statement-breakpoint
CREATE INDEX "stock_requests_member_idx" ON "stock_requests" USING btree ("issued_by_member_id");--> statement-breakpoint
CREATE INDEX "stock_requests_from_branch_idx" ON "stock_requests" USING btree ("from_branch_id");--> statement-breakpoint
CREATE INDEX "stock_requests_to_branch_idx" ON "stock_requests" USING btree ("to_branch_id");--> statement-breakpoint
CREATE INDEX "stock_requests_status_idx" ON "stock_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_requests_date_idx" ON "stock_requests" USING btree ("date_issued");--> statement-breakpoint
CREATE INDEX "stock_request_items_request_idx" ON "stock_request_items" USING btree ("stock_request_id");--> statement-breakpoint
CREATE INDEX "stock_request_items_product_idx" ON "stock_request_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "transfer_orders_number_idx" ON "transfer_orders" USING btree ("transfer_number");--> statement-breakpoint
CREATE INDEX "transfer_orders_from_branch_idx" ON "transfer_orders" USING btree ("from_branch_id");--> statement-breakpoint
CREATE INDEX "transfer_orders_to_branch_idx" ON "transfer_orders" USING btree ("to_branch_id");--> statement-breakpoint
CREATE INDEX "transfer_orders_member_idx" ON "transfer_orders" USING btree ("issued_by_member_id");--> statement-breakpoint
CREATE INDEX "transfer_orders_status_idx" ON "transfer_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transfer_orders_date_idx" ON "transfer_orders" USING btree ("date_issued");--> statement-breakpoint
CREATE INDEX "transfer_order_items_order_idx" ON "transfer_order_items" USING btree ("transfer_order_id");--> statement-breakpoint
CREATE INDEX "transfer_order_items_product_idx" ON "transfer_order_items" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_permissions_scope_idx" ON "role_permissions" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "role_permissions_role_scope_idx" ON "role_permissions" USING btree ("role_id","scope");--> statement-breakpoint
CREATE INDEX "appointments_room_idx" ON "appointments" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_e_invoice_status_idx" ON "payments" USING btree ("e_invoice_status");` },
	{ hash: "0007_short_korath", sql: `CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'approved', 'ordered', 'partially_received', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."promotion_type" AS ENUM('percentage', 'fixed_amount', 'free_item', 'buy_x_get_y');--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"ordered_qty" integer NOT NULL,
	"received_qty" integer DEFAULT 0 NOT NULL,
	"unit_cost" integer NOT NULL,
	"total_cost" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_number" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
	"order_date" timestamp with time zone NOT NULL,
	"expected_delivery_date" timestamp with time zone,
	"received_at" timestamp with time zone,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"customer_id" text NOT NULL,
	"sales_order_id" text NOT NULL,
	"discount_amount" integer NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "promotion_type" NOT NULL,
	"value" integer NOT NULL,
	"minimum_order_amount" integer DEFAULT 0 NOT NULL,
	"maximum_discount" integer,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_customer_limit" integer DEFAULT 1,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"branch_id" uuid,
	"applicable_product_ids" jsonb,
	"applicable_service_ids" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walk_in_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"branch_id" uuid,
	"date_of_birth" timestamp with time zone,
	"gender" text,
	"address" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"medical_notes" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"rate_in_basis_points" integer NOT NULL,
	"category" text DEFAULT 'SST' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_until" timestamp with time zone,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_items" ADD COLUMN "promotion_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "customer_type" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_in_customers" ADD CONSTRAINT "walk_in_customers_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "po_items_po_id_idx" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "po_items_product_idx" ON "purchase_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "po_number_idx" ON "purchase_orders" USING btree ("purchase_order_number");--> statement-breakpoint
CREATE INDEX "po_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "po_branch_idx" ON "purchase_orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "po_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "po_order_date_idx" ON "purchase_orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "po_created_by_idx" ON "purchase_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "po_supplier_status_idx" ON "purchase_orders" USING btree ("supplier_id","status");--> statement-breakpoint
CREATE INDEX "promo_usages_promo_idx" ON "promotion_usages" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "promo_usages_customer_idx" ON "promotion_usages" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "promo_usages_order_idx" ON "promotion_usages" USING btree ("sales_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_usages_unique_customer_order" ON "promotion_usages" USING btree ("promotion_id","customer_id","sales_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_code_idx" ON "promotions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "promotions_active_idx" ON "promotions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "promotions_valid_dates_idx" ON "promotions" USING btree ("valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "promotions_branch_idx" ON "promotions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "promotions_type_idx" ON "promotions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "walk_in_customers_name_idx" ON "walk_in_customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "walk_in_customers_phone_idx" ON "walk_in_customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "walk_in_customers_email_idx" ON "walk_in_customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "walk_in_customers_branch_idx" ON "walk_in_customers" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "walk_in_customers_active_idx" ON "walk_in_customers" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_code_idx" ON "tax_rates" USING btree ("code");--> statement-breakpoint
CREATE INDEX "tax_rates_active_idx" ON "tax_rates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "tax_rates_default_idx" ON "tax_rates" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "tax_rates_category_idx" ON "tax_rates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "payment_items_promotion_idx" ON "payment_items" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "sales_orders_customer_type_idx" ON "sales_orders" USING btree ("customer_type");` },
	{ hash: "0008_schema_consolidation", sql: `-- 0010_schema_consolidation.sql
-- Schema consolidation for Customer-app branch.
-- Drops 5 redundant tables and absorbs their data into services, sales_orders, package_instances.
-- Also renames appointment_clients.package_assignment_id -> package_instance_id (Finding 3 / Option A).
-- Adds sales_orders.cancelled_amount to persist partial refund data (Finding 1).
--
-- This file is idempotent across partial application via IF NOT EXISTS / IF EXISTS guards
-- and WHERE-clause checks on backfill UPDATEs. It runs as one atomic transaction — if any
-- statement fails, everything rolls back.
--
-- See zplan/12-04_14-00_schema-consolidation-finalization/01-phase1-write-migration-sql.md
-- for the full design rationale.

-- ============================================================================
-- SECTION 1: ADD NEW COLUMNS (nullable, no constraints yet)
-- ============================================================================

-- services gets the package-equivalent fields
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "session_count" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "expirable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "expiry_days" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "expiry_date" timestamp;--> statement-breakpoint

-- sales_orders gets cancellation metadata (previously in its own table)
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_number" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_date" timestamp;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancelled_amount" integer;--> statement-breakpoint

-- package_instances gets service_id (will replace package_id)
-- Nullable at first — we'll enforce NOT NULL after backfill.
ALTER TABLE "package_instances" ADD COLUMN IF NOT EXISTS "service_id" uuid;--> statement-breakpoint

-- ============================================================================
-- SECTION 2: PRE-FLIGHT CHECKS (abort if preconditions are not met)
-- ============================================================================

-- 2a. Every package must map to exactly one service by (name, branch_id)
DO $$
DECLARE
  unmapped_count integer;
BEGIN
  SELECT COUNT(*) INTO unmapped_count
  FROM packages p
  WHERE NOT EXISTS (
    SELECT 1 FROM services s
    WHERE s.name = p.name
      AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  );
  IF unmapped_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package(s) have no matching service (match by name + branch_id). Resolve manually before re-running.', unmapped_count;
  END IF;
END $$;--> statement-breakpoint

-- 2b. Every package name+branch must match exactly ONE service (not ambiguous)
DO $$
DECLARE
  ambiguous_count integer;
BEGIN
  SELECT COUNT(*) INTO ambiguous_count FROM (
    SELECT p.id
    FROM packages p
    JOIN services s ON s.name = p.name AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
    GROUP BY p.id
    HAVING COUNT(s.id) > 1
  ) ambiguous;
  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package(s) have ambiguous service matches. Services with duplicate (name, branch_id) must be deduplicated first.', ambiguous_count;
  END IF;
END $$;--> statement-breakpoint

-- 2c. Every package_instances.package_id must resolve to a known package
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM package_instances pi
  WHERE pi.package_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = pi.package_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package_instances row(s) reference non-existent packages. Delete orphans before re-running.', orphan_count;
  END IF;
END $$;--> statement-breakpoint

-- 2d. Every cancelled_sales.sales_order_id must resolve to a known sales order
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM cancelled_sales cs
  WHERE NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = cs.sales_order_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % cancelled_sales row(s) reference non-existent sales orders.', orphan_count;
  END IF;
END $$;--> statement-breakpoint

-- 2e. No duplicate cancellation_number values in the source
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT cancellation_number FROM cancelled_sales
    GROUP BY cancellation_number HAVING COUNT(*) > 1
  ) dups;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % duplicate cancellation_number(s) in cancelled_sales.', dup_count;
  END IF;
END $$;--> statement-breakpoint

-- ============================================================================
-- SECTION 3: BACKFILL NEW COLUMNS FROM LEGACY TABLES
-- ============================================================================

-- 3a. services: copy session_count, expirable, expiry_days, expiry_date from matching packages
UPDATE services s
SET session_count = p.session_count,
    expirable     = (p.expiry_days IS NOT NULL OR p.expiry_date IS NOT NULL),
    expiry_days   = p.expiry_days,
    expiry_date   = p.expiry_date,
    updated_at    = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.session_count IS NULL;--> statement-breakpoint

-- 3b. services: heuristic backfill of type and price.
--     Only overrides defaults/nulls — never clobbers explicit values.
UPDATE services s
SET type = p.appointment_type,
    updated_at = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.type = 'private'
  AND p.appointment_type IN ('private', 'semi_private', 'both');--> statement-breakpoint

UPDATE services s
SET price = p.price_per_session,
    updated_at = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.price IS NULL
  AND p.price_per_session IS NOT NULL;--> statement-breakpoint

-- 3c. package_instances: backfill service_id via the packages->services mapping
UPDATE package_instances pi
SET service_id = s.id,
    updated_at = now()
FROM packages p
JOIN services s
  ON s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
WHERE pi.package_id = p.id
  AND pi.service_id IS NULL;--> statement-breakpoint

-- 3d. sales_orders: copy cancellation metadata from cancelled_sales.
--     cancelled_amount comes from cancelled_sales.cancelled_amount — the whole point
--     of the partial-refund persistence fix.
UPDATE sales_orders so
SET cancellation_number = cs.cancellation_number,
    cancellation_date   = cs.cancellation_date,
    cancellation_reason = cs.cancellation_reason,
    cancelled_by        = cs.cancelled_by,
    cancelled_amount    = cs.cancelled_amount,
    updated_at          = now()
FROM cancelled_sales cs
WHERE so.id = cs.sales_order_id
  AND so.cancellation_number IS NULL;--> statement-breakpoint

-- ============================================================================
-- SECTION 4: POST-BACKFILL CHECKS
-- ============================================================================

-- 4a. Every package_instance should now have a service_id
DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM package_instances WHERE service_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill check failed: % package_instances row(s) still have NULL service_id.', null_count;
  END IF;
END $$;--> statement-breakpoint

-- 4b. Every cancelled sales_order should have a cancellation_number
DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM sales_orders
  WHERE status = 'cancelled' AND cancellation_number IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Backfill check failed: % cancelled sales_orders have no cancellation_number.', missing_count;
  END IF;
END $$;--> statement-breakpoint

-- ============================================================================
-- SECTION 5: ENFORCE NEW CONSTRAINTS
-- ============================================================================

ALTER TABLE "package_instances" ALTER COLUMN "service_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "package_instances"
  ADD CONSTRAINT "package_instances_service_id_services_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_cancellation_number_unique" UNIQUE ("cancellation_number");--> statement-breakpoint

-- ============================================================================
-- SECTION 5.5: RENAME appointment_clients ORPHAN COLUMN -> package_instance_id
-- ============================================================================
-- Per-client package credit tracking for group classes. The old column FK'd to
-- the dropped package_assignments table; we rename and re-point at package_instances.
-- Legacy UUID values are NULLed out — mock data only, no real history loss.

DROP INDEX IF EXISTS "appointment_clients_package_idx";--> statement-breakpoint

-- Drop the legacy FK first (the DROP TABLE package_assignments below would cascade it,
-- but being explicit keeps the statement order obvious).
ALTER TABLE "appointment_clients"
  DROP CONSTRAINT IF EXISTS "appointment_clients_package_assignment_id_package_assignments_id_fk";--> statement-breakpoint

ALTER TABLE "appointment_clients" RENAME COLUMN "package_assignment_id" TO "package_instance_id";--> statement-breakpoint
UPDATE appointment_clients SET package_instance_id = NULL;--> statement-breakpoint
ALTER TABLE "appointment_clients"
  ADD CONSTRAINT "appointment_clients_package_instance_id_package_instances_id_fk"
  FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- ============================================================================
-- SECTION 6: DROP LEGACY COLUMNS AND TABLES
-- ============================================================================

ALTER TABLE "package_instances" DROP COLUMN IF EXISTS "package_id";--> statement-breakpoint

DROP TABLE IF EXISTS "cancelled_sales" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "package_assignments" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "packages" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "service_commission_config" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "service_rules" CASCADE;--> statement-breakpoint

-- ============================================================================
-- SECTION 7: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "services_expiry_days_idx" ON "services" USING btree ("expiry_days");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_cancellation_number_idx" ON "sales_orders" USING btree ("cancellation_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_cancellation_date_idx" ON "sales_orders" USING btree ("cancellation_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "package_instances_service_idx" ON "package_instances" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointment_clients_package_instance_idx" ON "appointment_clients" USING btree ("package_instance_id");
` },
	{ hash: "0009_bouncy_namorita", sql: `CREATE TABLE "dashboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" uuid,
	"snapshot_date" timestamp with time zone NOT NULL,
	"period" text NOT NULL,
	"total_sales" integer DEFAULT 0 NOT NULL,
	"sales_order_count" integer DEFAULT 0 NOT NULL,
	"total_appointments" integer DEFAULT 0 NOT NULL,
	"completed_appointments" integer DEFAULT 0 NOT NULL,
	"active_members_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainer_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_stripe_accounts" DROP CONSTRAINT "partner_stripe_accounts_partner_id_members_user_id_fk";
--> statement-breakpoint
ALTER TABLE "trainer_availability" ADD CONSTRAINT "trainer_availability_trainer_id_members_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_snapshots_org_period_idx" ON "dashboard_snapshots" USING btree ("organization_id","period");--> statement-breakpoint
CREATE INDEX "dashboard_snapshots_date_idx" ON "dashboard_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "trainer_availability_trainer_id_idx" ON "trainer_availability" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX "trainer_availability_trainer_day_idx" ON "trainer_availability" USING btree ("trainer_id","day_of_week");` },
	{ hash: "0010_broad_ronan", sql: `ALTER TABLE "service_category_config" ADD COLUMN "buffer_time_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_members" ADD COLUMN "buffer_time_minutes" integer;` },
	{ hash: "0011_installments", sql: `ALTER TABLE "package_instances" ADD COLUMN "payment_plan_type" text;--> statement-breakpoint
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
` },
	{ hash: "0012_member_category_buffer", sql: `CREATE TABLE "member_category_buffer_overrides" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "member_id" uuid NOT NULL,
    "category_id" uuid NOT NULL,
    "buffer_time_minutes" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "mcbo_member_category_unique" UNIQUE("member_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "member_category_buffer_overrides" ADD CONSTRAINT "mcbo_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_category_buffer_overrides" ADD CONSTRAINT "mcbo_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mcbo_member_idx" ON "member_category_buffer_overrides" USING btree ("member_id");
--> statement-breakpoint
CREATE INDEX "mcbo_category_idx" ON "member_category_buffer_overrides" USING btree ("category_id");
--> statement-breakpoint
ALTER TABLE "service_members" DROP COLUMN IF EXISTS "buffer_time_minutes";
` },
	{ hash: "0013_google_calendar", sql: `CREATE TABLE IF NOT EXISTS "google_calendar_connections" (
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
CREATE TABLE IF NOT EXISTS "google_calendar_event_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "google_calendar_event_id" text;
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "google_calendar_event_mappings" ADD CONSTRAINT "gcal_event_mappings_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "google_calendar_event_mappings" ADD CONSTRAINT "gcal_event_mappings_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gcal_connections_member_idx" ON "google_calendar_connections" USING btree ("member_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gcal_connections_active_idx" ON "google_calendar_connections" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gcal_connections_scope_idx" ON "google_calendar_connections" USING btree ("sync_scope");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gcal_event_map_appt_conn_idx" ON "google_calendar_event_mappings" USING btree ("appointment_id","connection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gcal_event_map_appt_idx" ON "google_calendar_event_mappings" USING btree ("appointment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gcal_event_map_conn_idx" ON "google_calendar_event_mappings" USING btree ("connection_id");
` },
	{ hash: "0014_service_member_buffer", sql: `CREATE TABLE IF NOT EXISTS "member_service_buffer_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"buffer_time_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "msbo_member_service_unique_idx" UNIQUE ("member_id","service_id")
);
--> statement-breakpoint
ALTER TABLE "member_service_buffer_overrides" ADD CONSTRAINT "member_service_buffer_overrides_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_service_buffer_overrides" ADD CONSTRAINT "member_service_buffer_overrides_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msbo_member_idx" ON "member_service_buffer_overrides" USING btree ("member_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msbo_service_idx" ON "member_service_buffer_overrides" USING btree ("service_id");
--> statement-breakpoint
INSERT INTO member_service_buffer_overrides (member_id, service_id, buffer_time_minutes)
SELECT mcbo.member_id, sm.service_id, mcbo.buffer_time_minutes
FROM member_category_buffer_overrides mcbo
JOIN service_members sm ON sm.member_id = mcbo.member_id
JOIN services s ON s.id = sm.service_id AND s.category_id = mcbo.category_id
ON CONFLICT (member_id, service_id) DO NOTHING;
` },
	{ hash: "0015_grace_period", sql: `ALTER TABLE "services" ADD COLUMN "grace_period_days" integer;
` },
	{ hash: "0016_credits_generated", sql: `ALTER TABLE "package_instances" DROP COLUMN "credits_remaining";
--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "credits_remaining" integer GENERATED ALWAYS AS (COALESCE(credits_unlocked, credits_total) - credits_used) STORED NOT NULL;
` },
	{ hash: "0017_installment_plans", sql: `CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"num_installments" integer NOT NULL,
	"default_interval_days" integer DEFAULT 30 NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "installment_plans_code_idx" ON "installment_plans" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "installment_plans_active_idx" ON "installment_plans" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX "installment_plans_default_idx" ON "installment_plans" USING btree ("is_default");
--> statement-breakpoint
INSERT INTO installment_plans (code, name, num_installments, default_interval_days, sort_order, is_default)
VALUES
  ('full', 'Full Payment', 1, 30, 0, true),
  ('half', 'Half (2 installments)', 2, 30, 10, false),
  ('quarterly', 'Quarterly (4 installments)', 4, 30, 20, false)
ON CONFLICT (code) DO NOTHING;
` },
	{ hash: "0018_installment_plan_premium", sql: `ALTER TABLE "installment_plans" ADD COLUMN "price_premium_bps" integer DEFAULT 0 NOT NULL;
` },
	{ hash: "0019_audit_logs", sql: `CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id text NOT NULL,
  actor_member_id uuid,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  branch_id uuid,
  summary text NOT NULL,
  changes jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_branch_idx ON audit_logs(branch_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
` },
	{ hash: "0022_check_ins", sql: `CREATE TABLE IF NOT EXISTS check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_type text NOT NULL CHECK (client_type IN ('member','walk_in')),
  client_id text NOT NULL,
  branch_id uuid NOT NULL REFERENCES hierarchy_nodes(id) ON DELETE RESTRICT,
  appointment_client_id uuid REFERENCES appointment_clients(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('booking','drop_in')),
  outcome text NOT NULL DEFAULT 'attended' CHECK (outcome IN ('attended','no_show','late_cancel')),
  package_instance_id uuid,
  credits_consumed integer NOT NULL DEFAULT 0,
  notes text,
  checked_in_by text NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS check_ins_client_idx ON check_ins(client_type, client_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS check_ins_branch_idx ON check_ins(branch_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS check_ins_appt_client_idx ON check_ins(appointment_client_id);
CREATE INDEX IF NOT EXISTS check_ins_checked_in_at_idx ON check_ins(checked_in_at DESC);
` },
	{ hash: "0023_refunds", sql: `CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  sales_order_id uuid REFERENCES sales_orders(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES payments(id) ON DELETE RESTRICT,
  package_instance_id uuid REFERENCES package_instances(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL,
  tax_amount_cents integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  notes text,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  processed_by text,
  processed_at timestamptz,
  refund_method text,
  refund_reference text,
  branch_id uuid REFERENCES hierarchy_nodes(id) ON DELETE RESTRICT,
  customer_id text NOT NULL,
  customer_name text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refunds_must_target_one CHECK (
    sales_order_id IS NOT NULL OR payment_id IS NOT NULL OR package_instance_id IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS refunds_number_idx ON refunds(refund_number);
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds(status);
CREATE INDEX IF NOT EXISTS refunds_sales_order_idx ON refunds(sales_order_id);
CREATE INDEX IF NOT EXISTS refunds_payment_idx ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS refunds_package_instance_idx ON refunds(package_instance_id);
CREATE INDEX IF NOT EXISTS refunds_branch_idx ON refunds(branch_id);
CREATE INDEX IF NOT EXISTS refunds_customer_idx ON refunds(customer_id);
CREATE INDEX IF NOT EXISTS refunds_requested_at_idx ON refunds(requested_at DESC);
` },
	{ hash: "0024_commission_splits_status", sql: `ALTER TABLE commission_splits
  ALTER COLUMN appointment_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES payouts(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS commission_splits_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS commission_splits_appt_staff_unique
  ON commission_splits(appointment_id, staff_id)
  WHERE appointment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commission_splits_so_staff_unique
  ON commission_splits(sales_order_id, staff_id)
  WHERE sales_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS commission_splits_status_idx ON commission_splits(status);
CREATE INDEX IF NOT EXISTS commission_splits_payout_idx ON commission_splits(payout_id);
CREATE INDEX IF NOT EXISTS commission_splits_sales_order_idx ON commission_splits(sales_order_id);

ALTER TABLE commission_splits
  ADD CONSTRAINT commission_splits_must_target_one
  CHECK (
    (appointment_id IS NOT NULL AND sales_order_id IS NULL)
    OR (sales_order_id IS NOT NULL AND appointment_id IS NULL)
  );
` },
	{ hash: "0025_member_sessions", sql: `CREATE TABLE IF NOT EXISTS member_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  impersonated_member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  admin_user_id text NOT NULL,
  impersonated_user_id text NOT NULL,
  session_token text NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS member_sessions_admin_idx ON member_sessions(admin_member_id);
CREATE INDEX IF NOT EXISTS member_sessions_active_idx ON member_sessions(ended_at) WHERE ended_at IS NULL;
` },
	{ hash: "0026_pipeline_audit", sql: `CREATE EXTENSION IF NOT EXISTS btree_gist;
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
` },
	{ hash: "0027_walkin_commission", sql: `-- Walk-in customer support for package_instances
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
` },
	{ hash: "0028_checkin_display_name", sql: `ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS client_display_name TEXT;
` },
	{ hash: "0029_service_category_commission", sql: `-- Hand-edited: truncate commission history for clean-slate migration (confirmed by user)
TRUNCATE commission_splits CASCADE;
--> statement-breakpoint
-- Hand-edited: drop legacy per-service commission column (was added via db:push/0027, not in Drizzle journal)
ALTER TABLE "services" DROP COLUMN IF EXISTS "commission_percentage";
--> statement-breakpoint
CREATE TABLE "trainer_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rank" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_commission_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"payment_type" text NOT NULL,
	"is_conditional" boolean DEFAULT false NOT NULL,
	"max_coaches" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_coach_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"slot_index" integer NOT NULL,
	"label" text NOT NULL,
	"weightage_basis_points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_tier_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"trainer_tier_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_id" uuid NOT NULL,
	"condition_index" integer NOT NULL,
	"operator" text NOT NULL,
	"threshold" integer NOT NULL,
	"threshold_max" integer,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_condition_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"condition_id" uuid NOT NULL,
	"trainer_tier_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_commission_configs" ADD CONSTRAINT "category_commission_configs_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commission_coach_slots" ADD CONSTRAINT "commission_coach_slots_config_id_category_commission_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."category_commission_configs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commission_tier_rates" ADD CONSTRAINT "commission_tier_rates_config_id_category_commission_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."category_commission_configs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commission_tier_rates" ADD CONSTRAINT "commission_tier_rates_trainer_tier_id_trainer_tiers_id_fk" FOREIGN KEY ("trainer_tier_id") REFERENCES "public"."trainer_tiers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commission_conditions" ADD CONSTRAINT "commission_conditions_config_id_category_commission_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."category_commission_configs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commission_condition_rates" ADD CONSTRAINT "commission_condition_rates_condition_id_commission_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."commission_conditions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commission_condition_rates" ADD CONSTRAINT "commission_condition_rates_trainer_tier_id_trainer_tiers_id_fk" FOREIGN KEY ("trainer_tier_id") REFERENCES "public"."trainer_tiers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "trainer_tiers_name_idx" ON "trainer_tiers" USING btree ("name");
--> statement-breakpoint
CREATE INDEX "trainer_tiers_rank_idx" ON "trainer_tiers" USING btree ("rank");
--> statement-breakpoint
CREATE UNIQUE INDEX "trainer_tiers_name_unique" ON "trainer_tiers" USING btree ("name");
--> statement-breakpoint
CREATE UNIQUE INDEX "category_commission_configs_category_unique" ON "category_commission_configs" USING btree ("category_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "coach_slots_config_slot_unique" ON "commission_coach_slots" USING btree ("config_id","slot_index");
--> statement-breakpoint
CREATE INDEX "coach_slots_config_idx" ON "commission_coach_slots" USING btree ("config_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tier_rates_config_tier_unique" ON "commission_tier_rates" USING btree ("config_id","trainer_tier_id");
--> statement-breakpoint
CREATE INDEX "tier_rates_config_idx" ON "commission_tier_rates" USING btree ("config_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "conditions_config_index_unique" ON "commission_conditions" USING btree ("config_id","condition_index");
--> statement-breakpoint
CREATE INDEX "conditions_config_idx" ON "commission_conditions" USING btree ("config_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "condition_rates_condition_tier_unique" ON "commission_condition_rates" USING btree ("condition_id","trainer_tier_id");
--> statement-breakpoint
CREATE INDEX "condition_rates_condition_idx" ON "commission_condition_rates" USING btree ("condition_id");
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "trainer_tier_id" uuid;
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_trainer_tier_id_trainer_tiers_id_fk" FOREIGN KEY ("trainer_tier_id") REFERENCES "public"."trainer_tiers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "members_trainer_tier_idx" ON "members" USING btree ("trainer_tier_id");
--> statement-breakpoint
ALTER TABLE "appointment_staff" ADD COLUMN IF NOT EXISTS "slot_index" integer;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "sales_order_id" uuid;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "appointments_sales_order_idx" ON "appointments" USING btree ("sales_order_id");
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "slot_index" integer;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "condition_id" uuid;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "trainer_tier_id" uuid;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "weightage_basis_points" integer;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "base_amount_cents" integer;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "split_type" text DEFAULT 'automatic' NOT NULL;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "manual_note" text;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "earned_at" timestamp with time zone NOT NULL;
--> statement-breakpoint
CREATE INDEX "commission_splits_earned_at_idx" ON "commission_splits" USING btree ("earned_at");
--> statement-breakpoint
DROP INDEX IF EXISTS "service_category_config_incentive_idx";
--> statement-breakpoint
ALTER TABLE "service_category_config" DROP COLUMN IF EXISTS "incentive_type";
--> statement-breakpoint
ALTER TABLE "service_category_config" DROP COLUMN IF EXISTS "is_conditional";
--> statement-breakpoint
ALTER TABLE "service_category_config" DROP COLUMN IF EXISTS "max_staff";
--> statement-breakpoint
ALTER TABLE "service_category_config" DROP COLUMN IF EXISTS "staff_pool_percentage";
--> statement-breakpoint
ALTER TABLE "service_category_config" DROP COLUMN IF EXISTS "staff_weightage";
--> statement-breakpoint
ALTER TABLE "service_category_config" DROP COLUMN IF EXISTS "payment_structures";
--> statement-breakpoint
ALTER TABLE "service_category_config" DROP COLUMN IF EXISTS "threshold";
` },
	{ hash: "0015_abnormal_absorbing_man", sql: `ALTER TABLE "package_instances" ADD COLUMN "credits_admin_override" boolean DEFAULT false NOT NULL;` },
	{ hash: "0016_worried_wolfpack", sql: `ALTER TABLE "expenses" ALTER COLUMN "currency" SET DEFAULT 'myr';--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "allow_credit_overdraft" boolean DEFAULT false NOT NULL;` },
	{ hash: "0017_jazzy_hercules", sql: `ALTER TABLE "services" ADD COLUMN "time_preset_config" jsonb;` },
	{ hash: "0018_famous_ego", sql: `CREATE TABLE "package_instance_staff" (
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
CREATE INDEX "package_instance_staff_staff_idx" ON "package_instance_staff" USING btree ("staff_id");` },
	{ hash: "0021_add_tenant_migrations_metadata", sql: `-- Add metadata columns to drizzle_migrations tracking table.
-- Idempotent — safe to apply on tenants that already have these columns
-- (e.g. provisioned via the embedded migrator that pre-dates the file-based loader).
ALTER TABLE "drizzle_migrations" ADD COLUMN IF NOT EXISTS "checksum" text;
--> statement-breakpoint
ALTER TABLE "drizzle_migrations" ADD COLUMN IF NOT EXISTS "applied_at" timestamptz NOT NULL DEFAULT now();
` },
	{ hash: "0004_talented_terrax", sql: `-- Marker migration: superseded by embedded historical migrations.
-- Originally a phantom drizzle-kit recreation of tables already created by
-- 0005_schema_enhancement (member_profiles, service_members, service_category_config,
-- customer_profiles, notification_preferences, notifications, user_activity_log,
-- package_instances, preferred_times, class_slots, waitlist_entries, recurrence_rules,
-- announcements, expenses, payment_items + ALTER COLUMN additions to services/appointments/payments
-- + indexes/FKs). Idempotent no-op for tenants past the historical baseline.
SELECT 1;
` },
	{ hash: "0011_clear_marvex", sql: `-- Marker migration: superseded by embedded historical migrations.
-- Originally a phantom drizzle-kit recreation of: member_category_buffer_overrides
-- (0012_member_category_buffer), member_service_buffer_overrides (0014_service_member_buffer),
-- installments + installment_events + organization_settings + package_instances ALTER COLs
-- (0011_installments), google_calendar_connections + google_calendar_event_mappings +
-- appointments.google_calendar_event_id (0013_google_calendar), services.available_payment_plans
-- + services.installment_interval_days (0011_installments), service_members.buffer_time_minutes
-- DROP (0012_member_category_buffer). Idempotent no-op for tenants past the historical baseline.
SELECT 1;
` },
	{ hash: "0012_military_captain_marvel", sql: `-- Marker migration: superseded by embedded historical migrations.
-- Originally a phantom drizzle-kit recreation of: installment_plans table + indexes
-- (0017_installment_plans), package_instances.credits_remaining drop+regenerate as STORED
-- (0016_credits_generated), services.grace_period_days (0015_grace_period). Idempotent
-- no-op for tenants past the historical baseline.
SELECT 1;
` },
	{ hash: "0013_dashing_venus", sql: `-- Marker migration: superseded by embedded historical migrations.
-- Originally a phantom drizzle-kit recreation of: audit_logs (0019_audit_logs),
-- check_ins (0022_check_ins), member_sessions (0025_member_sessions), refunds (0023_refunds),
-- commission_splits ALTERs + indexes (0024_commission_splits_status), and
-- installment_plans.price_premium_bps (0018_installment_plan_premium). Idempotent no-op
-- for tenants past the historical baseline.
SELECT 1;
` },
	{ hash: "0014_expenses_currency_myr", sql: `-- Mixed-but-naturally-idempotent migration:
--   * UPDATE expenses ... WHERE currency = 'usd'  -> NOVEL data correction; idempotent
--     by predicate (no-op once all rows are 'myr').
--   * ALTER TABLE expenses ALTER COLUMN currency SET DEFAULT 'myr'  -> duplicate of
--     0016_worried_wolfpack, but SET DEFAULT is idempotent in PostgreSQL.
-- Safe to re-run on tenants past the historical baseline.
UPDATE expenses SET currency = 'myr' WHERE currency = 'usd';
--> statement-breakpoint
ALTER TABLE expenses ALTER COLUMN currency SET DEFAULT 'myr';
` },
	{ hash: "0014_lively_jane_foster", sql: `-- Marker migration: superseded by embedded historical migrations.
-- Originally a phantom drizzle-kit recreation of the entire Phase 1 service-category
-- commission system that ships in 0029_service_category_commission (trainer_tiers,
-- category_commission_configs, commission_coach_slots, commission_tier_rates,
-- commission_conditions, commission_condition_rates + members.trainer_tier_id +
-- appointments.sales_order_id + appointment_staff.slot_index + commission_splits ALTERs
-- + service_category_config column drops). NOTE: the original newcomer also contained a
-- destructive \`TRUNCATE commission_splits CASCADE\` and a \`DROP COLUMN commission_percentage\`
-- — those were already executed on every existing tenant via 0029. Re-running them on a
-- tenant past the historical baseline would be unsafe data loss, so they are intentionally
-- NOT carried forward in this marker. Idempotent no-op for tenants past the baseline.
SELECT 1;
` },
	{ hash: "0019_gray_rachel_grey", sql: `-- NOVEL: adds package_instances.preferred_trainer_id with FK to members.id.
-- Rewritten with idempotent guards so re-running on a tenant that already has
-- the column / constraint succeeds.
ALTER TABLE "package_instances" ADD COLUMN IF NOT EXISTS "preferred_trainer_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "package_instances" ADD CONSTRAINT "package_instances_preferred_trainer_id_members_id_fk" FOREIGN KEY ("preferred_trainer_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
` },
	{ hash: "0020_add_coach_intake_tables", sql: `-- NOVEL: adds coach_intake_availability + coach_intake_exceptions tables.
-- Rewritten with idempotent guards so re-running succeeds on tenants that
-- already have the tables / constraints / indexes.
CREATE TABLE IF NOT EXISTS "coach_intake_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coach_intake_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_intake_exc_unique" UNIQUE("trainer_id","date","start_time","end_time")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "coach_intake_availability" ADD CONSTRAINT "coach_intake_availability_trainer_id_members_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "coach_intake_exceptions" ADD CONSTRAINT "coach_intake_exceptions_trainer_id_members_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_intake_trainer_idx" ON "coach_intake_availability" USING btree ("trainer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_intake_trainer_day_idx" ON "coach_intake_availability" USING btree ("trainer_id","day_of_week");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_intake_exc_trainer_date_idx" ON "coach_intake_exceptions" USING btree ("trainer_id","date");
` },
	{ hash: "0022_fix_walk_in_customer_actions", sql: `-- migration: 0022_fix_walk_in_customer_actions
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
` },
	{ hash: "0023_add_member_role_id", sql: `-- Wave 3a Agent 2.1 (Journey J1): adds members.role_id with FK to roles.id and an index.
-- Idempotent so re-running on a tenant that already has the column / constraint succeeds.
-- ON DELETE SET NULL: deleting a custom role preserves the member, falling permissions
-- back to the legacy text role.
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "role_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "members" ADD CONSTRAINT "members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_role_id_idx" ON "members" ("role_id");
` },
	{ hash: "0030_add_appointment_exclude_constraints", sql: `-- migration: 0030_add_appointment_exclude_constraints
-- description: J3 — DB-level guard on overlapping appointment bookings.
--
-- Phase 2 / Wave 3a / Agent 2.4. Pairs with the trainer EXCLUDE that already
-- shipped via 0026_pipeline_audit. This file:
--   1. (Re-)ensures the trainer overlap constraint is present, idempotently.
--      0026 added it, but on tenants where 0026 has not yet rolled out we
--      still want this guarantee. The pg_constraint guard makes this a
--      no-op everywhere it already exists.
--   2. Adds the matching room overlap constraint (new in this migration).
--
-- Notes for ops:
--   - \`appointments.start_time\` / \`end_time\` are plain \`timestamp\` columns
--     (no timezone), so we use \`tsrange\`, NOT \`tstzrange\`. Mismatching the
--     range type to the column type would error at constraint-check time.
--   - Status values are \`'cancelled'\` and \`'no-show'\` (hyphen, not underscore).
--   - \`WHERE <col> IS NOT NULL\` is required on the partial index because
--     trainer_id / room_id are nullable; a NULL would otherwise be treated
--     as "not equal" and would not collide, but excluding nulls keeps the
--     index lean.
--   - If a tenant DB already has overlapping rows, the \`ALTER TABLE ... ADD
--     CONSTRAINT\` will fail. Run \`apps/server/scripts/check-appointment-overlaps.ts\`
--     pre-deploy to detect and clean up.

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
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_room_no_overlap'
  ) THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_room_no_overlap
      EXCLUDE USING GIST (
        room_id WITH =,
        tsrange(start_time, end_time, '[)') WITH &&
      )
      WHERE (status NOT IN ('cancelled', 'no-show') AND room_id IS NOT NULL);
  END IF;
END $$;
` },
	{ hash: "0031_add_status_history", sql: `-- migration: 0031_add_status_history
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
` },
	{ hash: "0032_add_branch_pricing", sql: `-- migration: 0032_add_branch_pricing
-- Agent 2.2 (Wave 3b) — J2 pricing leg: branch-scoped pricing tables
-- Earlier migrations: 0021 (metadata), 0022 (walk_in fix), 0023 (member_role_id),
-- 0023-0029 also taken historically, 0030 (appointment EXCLUDE), 0031 (status history).
-- Next free slot is 0032.
-- Idempotent: CREATE TABLE IF NOT EXISTS, FK ALTERs wrapped in DO $$ EXCEPTION,
-- CREATE INDEX IF NOT EXISTS. Safe to re-run.

CREATE TABLE IF NOT EXISTS "service_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"branch_id" uuid,
	"customer_type" text,
	"price_cents" integer NOT NULL,
	"effective_from" timestamptz NOT NULL DEFAULT now(),
	"effective_until" timestamptz,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"branch_id" uuid,
	"customer_type" text,
	"price_cents" integer NOT NULL,
	"effective_from" timestamptz NOT NULL DEFAULT now(),
	"effective_until" timestamptz,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_service_id_fk"
		FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_branch_id_fk"
		FOREIGN KEY ("branch_id") REFERENCES "hierarchy_nodes"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_fk"
		FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_branch_id_fk"
		FOREIGN KEY ("branch_id") REFERENCES "hierarchy_nodes"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_prices_lookup_idx" ON "service_prices" ("service_id", "branch_id", "customer_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_prices_lookup_idx" ON "product_prices" ("product_id", "branch_id", "customer_type");
` },
	{ hash: "0033_add_tax_rate_snapshots", sql: `-- migration: 0033_add_tax_rate_snapshots
-- description: Agent 2.3 — Phase 2 Wave 3b — Journey J2
--   Capture tax_rate_id at line-item creation so historical orders / receipts
--   reproduce the applied rate after the underlying tax_rates row is edited.
--   Reserved 0033 because 0030 (appointment exclude), 0031 (status history),
--   and 0032 (parallel Agent 2.2 — branch pricing) are taken.

ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "tax_rate_id" uuid;
--> statement-breakpoint
ALTER TABLE "payment_items" ADD COLUMN IF NOT EXISTS "tax_rate_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_tax_rate_id_fk"
    FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_tax_rate_id_fk"
    FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_order_items_tax_rate_idx" ON "sales_order_items" ("tax_rate_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_items_tax_rate_idx" ON "payment_items" ("tax_rate_id");
` },
	{ hash: "0034_commission_audit", sql: `-- migration: 0034_commission_audit
-- description: Agent 2.5 — J5 commission audit
--   * payout_batches: groups payouts by branch+period for dispute reproducibility
--   * category_commission_config_versions: append-only metadata snapshot of
--     commission config saves (auto-emitted by AFTER INSERT trigger because the
--     existing upsert path is DELETE-then-INSERT)
--   * commission_splits: add package_instance_id (third source) and
--     config_version_id (frozen-config link)
--   * payouts.batch_id: link payout to its batch

CREATE TABLE IF NOT EXISTS "payout_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "branch_id" uuid,
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "total_cents" integer NOT NULL DEFAULT 0,
  "created_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "finalized_at" timestamptz
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_branch_id_fk"
    FOREIGN KEY ("branch_id") REFERENCES "hierarchy_nodes"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_batches_period_idx"
  ON "payout_batches" ("period_start", "period_end");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_batches_branch_idx"
  ON "payout_batches" ("branch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_batches_status_idx"
  ON "payout_batches" ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "category_commission_config_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "category_id" uuid NOT NULL,
  "config_id" uuid,
  "version_number" integer NOT NULL,
  "payment_type" text NOT NULL,
  "is_conditional" boolean NOT NULL DEFAULT false,
  "max_coaches" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" text NOT NULL DEFAULT 'system'
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "category_commission_config_versions" ADD CONSTRAINT
    "commission_config_versions_category_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "commission_config_versions_category_version_unique"
  ON "category_commission_config_versions" ("category_id", "version_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_config_versions_category_idx"
  ON "category_commission_config_versions" ("category_id");
--> statement-breakpoint

-- Auto-version trigger: existing upsertCategoryCommissionConfig is
-- DELETE-then-INSERT, so AFTER INSERT fires once per save. We snapshot only
-- parent metadata; per-split reproducibility is already carried on
-- commission_splits via weightageBasisPoints/baseAmountCents/conditionId/etc.
CREATE OR REPLACE FUNCTION fn_emit_commission_config_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM category_commission_config_versions
    WHERE category_id = NEW.category_id;

  INSERT INTO category_commission_config_versions
    (category_id, config_id, version_number, payment_type, is_conditional, max_coaches, created_by)
  VALUES
    (NEW.category_id, NEW.id, next_version, NEW.payment_type, NEW.is_conditional, NEW.max_coaches, 'system');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_emit_commission_config_version ON category_commission_configs;
--> statement-breakpoint
CREATE TRIGGER trg_emit_commission_config_version
  AFTER INSERT ON category_commission_configs
  FOR EACH ROW
  EXECUTE FUNCTION fn_emit_commission_config_version();
--> statement-breakpoint

ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "batch_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payouts" ADD CONSTRAINT "payouts_batch_id_fk"
    FOREIGN KEY ("batch_id") REFERENCES "payout_batches"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_batch_id_idx" ON "payouts" ("batch_id");
--> statement-breakpoint

ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "package_instance_id" uuid;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "config_version_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_package_instance_id_fk"
    FOREIGN KEY ("package_instance_id") REFERENCES "package_instances"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_config_version_id_fk"
    FOREIGN KEY ("config_version_id") REFERENCES "category_commission_config_versions"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_splits_package_instance_idx"
  ON "commission_splits" ("package_instance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_splits_config_version_idx"
  ON "commission_splits" ("config_version_id");
--> statement-breakpoint

-- Extend the one-of-N source CHECK to include package_instance_id.
-- Existing constraint name (per 0024): commission_splits_must_target_one.
-- We use NOT VALID + VALIDATE so a row that already satisfies the original
-- exclusivity (appointment XOR sales_order, with package_instance NULL) also
-- satisfies the new check. New constraint name reflects the broader contract.
ALTER TABLE "commission_splits"
  DROP CONSTRAINT IF EXISTS "commission_splits_must_target_one";
--> statement-breakpoint
ALTER TABLE "commission_splits"
  ADD CONSTRAINT "commission_splits_must_target_one"
  CHECK (
    (CASE WHEN appointment_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN sales_order_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN package_instance_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE "commission_splits"
  VALIDATE CONSTRAINT "commission_splits_must_target_one";
` },
	{ hash: "0035_add_refund_items", sql: `-- migration: 0035_add_refund_items
-- description: Agent 2.8 — J5 partial-package refund line items
--   * refund_items: per-line refund records (one of sales_order_item or
--     package_instance), with optional credits_refunded for per-credit audit

CREATE TABLE IF NOT EXISTS "refund_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "refund_id" uuid NOT NULL,
  "sales_order_item_id" uuid,
  "package_instance_id" uuid,
  "credits_refunded" integer,
  "amount_cents" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_refund_id_fk"
    FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_sales_order_item_id_fk"
    FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_package_instance_id_fk"
    FOREIGN KEY ("package_instance_id") REFERENCES "package_instances"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_one_source_check"
    CHECK (num_nonnulls(sales_order_item_id, package_instance_id) = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_items_refund_idx" ON "refund_items" ("refund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_items_package_idx" ON "refund_items" ("package_instance_id");
` },
	{ hash: "0036_add_commission_reversals", sql: `-- migration: 0036_add_commission_reversals
-- description: Agent 2.9 — J5 refund→commission reversal chain.
--   * commission_split_reversals: chain rows linking refund → reversed split → payout adjustment
--   * Self-FK on reversed_by_reversal_id uses DEFERRABLE INITIALLY DEFERRED so a cycle of
--     reversals (X reverses Y, then Z reverses X) can be inserted in any order within a tx.
--     Drizzle's generator cannot emit DEFERRABLE — this migration is hand-rolled raw SQL.

CREATE TABLE IF NOT EXISTS "commission_split_reversals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reversed_split_id" uuid NOT NULL,
  "refund_id" uuid NOT NULL,
  "reversed_by_reversal_id" uuid,
  "payout_adjustment_id" uuid,
  "amount_cents" integer NOT NULL,
  "reason" text,
  "created_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commission_split_reversals" ADD CONSTRAINT "commission_split_reversals_reversed_split_id_fk"
    FOREIGN KEY ("reversed_split_id") REFERENCES "commission_splits"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commission_split_reversals" ADD CONSTRAINT "commission_split_reversals_refund_id_fk"
    FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- DEFERRABLE for cycle: self-FK on reversed_by_reversal_id
DO $$ BEGIN
  ALTER TABLE "commission_split_reversals"
    ADD CONSTRAINT "commission_split_reversals_reversed_by_reversal_id_fk"
    FOREIGN KEY ("reversed_by_reversal_id") REFERENCES "commission_split_reversals"("id") ON DELETE set null
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "commission_split_reversals" ADD CONSTRAINT "commission_split_reversals_payout_adjustment_id_fk"
    FOREIGN KEY ("payout_adjustment_id") REFERENCES "payouts"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_split_reversals_refund_idx" ON "commission_split_reversals" ("refund_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_split_reversals_split_idx" ON "commission_split_reversals" ("reversed_split_id");
--> statement-breakpoint
-- Assertion: verify the deferrable flag was actually set (Drizzle won't otherwise)
DO $$
DECLARE
  is_deferrable boolean;
BEGIN
  SELECT condeferrable INTO is_deferrable FROM pg_constraint
   WHERE conname = 'commission_split_reversals_reversed_by_reversal_id_fk';
  IF is_deferrable IS NULL OR NOT is_deferrable THEN
    RAISE EXCEPTION 'DEFERRABLE flag missing on commission_split_reversals_reversed_by_reversal_id_fk';
  END IF;
END$$;
` },
	{ hash: "0037_add_promotion_waitlist_announcement_scopes", sql: `-- migration: 0037_add_promotion_waitlist_announcement_scopes
-- description: Agent 2.10 (audit-driven §8.5)
--   1. payment_items.promotion_id FK + index (column already exists; constraint may be missing)
--   2. waitlist_entries polymorphic typed FKs (member / customer_profile / walk_in_customer)
--      + NOT VALID CHECK so legacy rows (with only user_id populated) keep validating.
--      No \`client_type\` discriminator — exactly-one-of CHECK suffices.
--   3. announcement_scopes junction for multi-branch announcements.
--
-- Schema deviation from plan brief:
--   Plan §8.5 stated waitlist_entries had an existing \`member_id uuid\` FK to members.
--   Actual current schema has \`user_id text\` (Better-Auth cross-DB id, no FK).
--   This migration ADDS member_id (new column) alongside customer_profile_id /
--   walk_in_customer_id. Legacy \`user_id\` is preserved (NOT NULL) for back-compat;
--   new writers should populate one of the typed FKs.

-- 1. payment_items.promotion_id FK (column exists, may lack constraint + index)
DO $$ BEGIN
  ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_promotion_id_fk"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_items_promotion_id_idx" ON "payment_items" ("promotion_id");
--> statement-breakpoint

-- 2. waitlist_entries: add typed FK columns + indexes + NOT VALID CHECK
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "member_id" uuid;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "customer_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "walk_in_customer_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_member_id_fk"
    FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_customer_profile_id_fk"
    FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_walk_in_customer_id_fk"
    FOREIGN KEY ("walk_in_customer_id") REFERENCES "walk_in_customers"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- CHECK: at most one typed-FK populated (allows zero for legacy rows w/ only user_id).
-- NOT VALID so existing rows (all NULL on new cols) skip validation; new/updated rows enforced.
DO $$ BEGIN
  ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_one_client_check"
    CHECK (num_nonnulls(member_id, customer_profile_id, walk_in_customer_id) <= 1) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_entries_member_idx" ON "waitlist_entries" ("member_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_entries_customer_profile_idx" ON "waitlist_entries" ("customer_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_entries_walk_in_customer_idx" ON "waitlist_entries" ("walk_in_customer_id");
--> statement-breakpoint

-- 3. announcement_scopes junction
CREATE TABLE IF NOT EXISTS "announcement_scopes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "announcement_scopes" ADD CONSTRAINT "announcement_scopes_announcement_id_fk"
    FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "announcement_scopes" ADD CONSTRAINT "announcement_scopes_branch_id_fk"
    FOREIGN KEY ("branch_id") REFERENCES "hierarchy_nodes"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "announcement_scopes_unique_idx" ON "announcement_scopes" ("announcement_id", "branch_id");
` },
	{ hash: "0038_add_goods_receipts_supplier_invoices", sql: `-- migration: 0038_add_goods_receipts_supplier_invoices
-- description: Agent 2.11 — goods-receipt 3-way match infrastructure
--   * goods_receipts: physical receipt records against a PO
--   * goods_receipt_items: per-line receipt detail (links to po_items.unit_cost)
--   * supplier_invoices: 3-way match (PO ≈ receipt ≈ invoice totals)

CREATE TABLE IF NOT EXISTS "goods_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "receipt_number" text NOT NULL,
  "purchase_order_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "received_at" timestamptz NOT NULL,
  "received_by" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fk"
    FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_branch_id_fk"
    FOREIGN KEY ("branch_id") REFERENCES "hierarchy_nodes"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipts_po_idx" ON "goods_receipts" ("purchase_order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_number_unique" ON "goods_receipts" ("receipt_number");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "goods_receipt_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "goods_receipt_id" uuid NOT NULL,
  "purchase_order_item_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity_received" integer NOT NULL,
  "quantity_damaged" integer NOT NULL DEFAULT 0,
  "notes" text
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_goods_receipt_id_fk"
    FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_purchase_order_item_id_fk"
    FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipt_items_receipt_idx" ON "goods_receipt_items" ("goods_receipt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "goods_receipt_items_po_item_idx" ON "goods_receipt_items" ("purchase_order_item_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "supplier_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_number" text NOT NULL,
  "supplier_id" uuid NOT NULL,
  "purchase_order_id" uuid,
  "goods_receipt_id" uuid,
  "total_cents" integer NOT NULL,
  "tax_cents" integer NOT NULL DEFAULT 0,
  "invoice_date" timestamptz NOT NULL,
  "due_date" timestamptz,
  "status" text NOT NULL DEFAULT 'pending',
  "matched_at" timestamptz,
  "matched_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_fk"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchase_order_id_fk"
    FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_goods_receipt_id_fk"
    FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_po_idx" ON "supplier_invoices" ("purchase_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_receipt_idx" ON "supplier_invoices" ("goods_receipt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_invoices_supplier_idx" ON "supplier_invoices" ("supplier_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoices_number_unique" ON "supplier_invoices" ("supplier_id", "invoice_number");
` },
	{ hash: "0039_add_catalog_audit_fields", sql: `-- migration: 0039_add_catalog_audit_fields
-- description: Agent 2.13 — §8.5 audit-added: createdBy/updatedBy on catalog tables
--   * services, products, brands, service_categories, product_categories
--   * Nullable text columns (existing rows have no actor recorded).
--   * Service-level write hooks set actor on every mutation.

ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "updated_by" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "updated_by" text;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "updated_by" text;
--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN IF NOT EXISTS "updated_by" text;
--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "updated_by" text;
` },
	{ hash: "0040_add_membership_holds", sql: `-- migration: 0040_add_membership_holds
-- description: Agent 3.1 (Phase 3 — J4) — membership freeze/resume audit trail.
--   * membership_holds: one row per freeze (medical / travel / other).
--   * Cron \`auto-resume-holds\` reads the (end_date, status) index nightly
--     to flip expired holds back to 'completed' and revert package_instances.status.
--   * No new enum types — \`reason\` and \`status\` are free-text validated at the
--     service layer (Drizzle/Zod), keeping migrations idempotent.

CREATE TABLE IF NOT EXISTS "membership_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_instance_id" uuid NOT NULL,
	"member_id" uuid,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"fee_waived" boolean NOT NULL DEFAULT false,
	"status" text NOT NULL DEFAULT 'active',
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"resumed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "membership_holds"
		ADD CONSTRAINT "membership_holds_package_instance_id_fk"
		FOREIGN KEY ("package_instance_id") REFERENCES "package_instances"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "membership_holds"
		ADD CONSTRAINT "membership_holds_member_id_fk"
		FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_holds_package_idx"
	ON "membership_holds" ("package_instance_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "membership_holds_resume_idx"
	ON "membership_holds" ("end_date", "status");
` },
	{ hash: "0041_add_payment_conversion_link", sql: `-- migration: 0041_add_payment_conversion_link
-- description: Agent 3.5 — §5 Phase 3: payments self-ref FK for walk-in → package conversion
--   Adds converted_from_payment_id (nullable, self-ref FK with ON DELETE SET NULL).
--   Used when a walk-in drop-in payment is converted to a package payment mid-session.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "converted_from_payment_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_converted_from_payment_id_fk"
    FOREIGN KEY ("converted_from_payment_id") REFERENCES "payments"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_converted_from_idx" ON "payments" ("converted_from_payment_id");
` },
	{ hash: "0042_add_complimentary_tracking", sql: `-- migration: 0042_add_complimentary_tracking
-- description: Agent 3.3 — Phase 3 §5: comp/complimentary order tracking
--   * sales_orders.complimentary_reason: text, nullable. When set, the order is
--     marked comp and ALL lines are excluded from commission split creation.
--   * sales_order_items.commission_excluded: boolean default false. Per-line
--     opt-out so a single line on an otherwise normal order can be excluded.
--   * commission-splits.service.ts skips split creation when either flag fires.

ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "complimentary_reason" text;
--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "commission_excluded" boolean NOT NULL DEFAULT false;
` },
	{ hash: "0043_add_commission_caps", sql: `-- migration: 0043_add_commission_caps
-- description: Agent 3.4 — Phase 3 §5 commission caps/floors.
--   * category_commission_configs: max_per_cycle_cents (uncapped when null),
--     exclude_if_discount_above_pct (basis points; null = no exclusion)
--   * category_commission_config_versions: mirror both columns so snapshot
--     history preserves cap configuration
--   * fn_emit_commission_config_version: extend snapshot SQL to include new cols

ALTER TABLE "category_commission_configs"
  ADD COLUMN IF NOT EXISTS "max_per_cycle_cents" integer;
--> statement-breakpoint
ALTER TABLE "category_commission_configs"
  ADD COLUMN IF NOT EXISTS "exclude_if_discount_above_pct" integer;
--> statement-breakpoint

ALTER TABLE "category_commission_config_versions"
  ADD COLUMN IF NOT EXISTS "max_per_cycle_cents" integer;
--> statement-breakpoint
ALTER TABLE "category_commission_config_versions"
  ADD COLUMN IF NOT EXISTS "exclude_if_discount_above_pct" integer;
--> statement-breakpoint

-- Replace the trigger function so future config saves carry cap fields into
-- the version-history audit row. (CREATE OR REPLACE — same signature; the
-- AFTER INSERT trigger from 0034 continues to bind to this function.)
CREATE OR REPLACE FUNCTION fn_emit_commission_config_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM category_commission_config_versions
    WHERE category_id = NEW.category_id;

  INSERT INTO category_commission_config_versions
    (category_id, config_id, version_number, payment_type, is_conditional,
     max_coaches, max_per_cycle_cents, exclude_if_discount_above_pct, created_by)
  VALUES
    (NEW.category_id, NEW.id, next_version, NEW.payment_type, NEW.is_conditional,
     NEW.max_coaches, NEW.max_per_cycle_cents, NEW.exclude_if_discount_above_pct, 'system');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
` },
	{ hash: "0044_add_lead_source", sql: `-- migration: 0044_add_lead_source
-- description: Agent 3.2 (Phase 3) — lead-source attribution.
--   * lead_sources: lookup table of acquisition channels.
--   * customer_profiles: 3 additive columns (lead_source_id, referrer_member_id, campaign_id).
--   * All FKs use ON DELETE SET NULL so profile rows survive lookup churn.
--   * Idempotent — safe to re-run; no enum types.

CREATE TABLE IF NOT EXISTS "lead_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_sources_name_unique" ON "lead_sources" ("name");
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "lead_source_id" uuid;
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "referrer_member_id" uuid;
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "campaign_id" text;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "customer_profiles"
		ADD CONSTRAINT "customer_profiles_lead_source_id_fk"
		FOREIGN KEY ("lead_source_id") REFERENCES "lead_sources"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "customer_profiles"
		ADD CONSTRAINT "customer_profiles_referrer_member_id_fk"
		FOREIGN KEY ("referrer_member_id") REFERENCES "members"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_lead_source_idx"
	ON "customer_profiles" ("lead_source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_referrer_member_idx"
	ON "customer_profiles" ("referrer_member_id");
` },
	{ hash: "0045_add_households", sql: `-- migration: 0045_add_households
-- description: Agent 3.6 (Phase 3) — household linking.
--   * households: groups customer_profiles into a billing/family unit.
--   * customer_profiles.household_id: reverse pointer (ON DELETE SET NULL).
--   * Cycle households.primary_contact_profile_id <-> customer_profiles.household_id
--     resolved with DEFERRABLE INITIALLY DEFERRED on the households side, so a
--     fresh household + primary profile can be inserted in a single tx in any order.
--     Drizzle's generator cannot emit DEFERRABLE — this migration is hand-rolled raw SQL.
--   * All FKs ON DELETE SET NULL: profile rows survive household deletion and
--     household rows survive primary-contact profile deletion.
--   * Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"primary_contact_profile_id" uuid,
	"notes" text,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "household_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "customer_profiles"
		ADD CONSTRAINT "customer_profiles_household_id_fk"
		FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- DEFERRABLE for cycle: households.primary_contact_profile_id -> customer_profiles.id
DO $$ BEGIN
	ALTER TABLE "households"
		ADD CONSTRAINT "households_primary_contact_profile_id_fk"
		FOREIGN KEY ("primary_contact_profile_id") REFERENCES "customer_profiles"("id") ON DELETE set null
		DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_household_idx"
	ON "customer_profiles" ("household_id");
--> statement-breakpoint
-- Assertion: verify the deferrable flag was actually set (Drizzle won't otherwise)
DO $$
DECLARE
	is_deferrable boolean;
BEGIN
	SELECT condeferrable INTO is_deferrable FROM pg_constraint
	 WHERE conname = 'households_primary_contact_profile_id_fk';
	IF is_deferrable IS NULL OR NOT is_deferrable THEN
		RAISE EXCEPTION 'DEFERRABLE flag missing on households_primary_contact_profile_id_fk';
	END IF;
END$$;
` },
	{ hash: "0046_dashboard_audit_fixes", sql: `-- migration: 0046_dashboard_audit_fixes
-- description: Dashboard audit fixes — FK relationships, missing columns, index coverage,
--   promotion_usages sales_order_id text→uuid, commission_splits boolean flags,
--   cap/floor cols on commission config tables, payouts P0 NOT NULL drop.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. members — add leadSourceId, householdId, invitationId
-- ============================================================
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "lead_source_id" uuid;
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "household_id" uuid;
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "invitation_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "members"
		ADD CONSTRAINT "members_lead_source_id_fk"
		FOREIGN KEY ("lead_source_id") REFERENCES "lead_sources"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "members"
		ADD CONSTRAINT "members_household_id_fk"
		FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "members"
		ADD CONSTRAINT "members_invitation_id_fk"
		FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_lead_source_idx" ON "members" ("lead_source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_household_idx" ON "members" ("household_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_invitation_idx" ON "members" ("invitation_id");

-- ============================================================
-- 2. walk_in_customers — add customerProfileId, convertedAt
-- ============================================================
ALTER TABLE "walk_in_customers" ADD COLUMN IF NOT EXISTS "customer_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "walk_in_customers" ADD COLUMN IF NOT EXISTS "converted_at" timestamptz;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "walk_in_customers"
		ADD CONSTRAINT "walk_in_customers_customer_profile_id_fk"
		FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profiles"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "walk_in_customers_customer_profile_idx"
	ON "walk_in_customers" ("customer_profile_id");

-- ============================================================
-- 3. commission_splits — add 4 boolean flags + update CHECK
-- ============================================================
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "cap_applied" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "floor_applied" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "excluded" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "is_complimentary" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Drop old one-of-two check (name may vary across environments)
ALTER TABLE "commission_splits" DROP CONSTRAINT IF EXISTS "commission_splits_source_check";
--> statement-breakpoint
ALTER TABLE "commission_splits" DROP CONSTRAINT IF EXISTS "commission_splits_one_source_check";
--> statement-breakpoint
-- Add new one-of-three check (appointment | sales_order | package_instance)
ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_source_check"
	CHECK (
		((appointment_id IS NOT NULL)::int +
		 (sales_order_id IS NOT NULL)::int +
		 (package_instance_id IS NOT NULL)::int) = 1
	) NOT VALID;
--> statement-breakpoint
ALTER TABLE "commission_splits" VALIDATE CONSTRAINT "commission_splits_source_check";

-- ============================================================
-- 4. category_commission_configs + versions — add cap/floor cols
-- ============================================================
ALTER TABLE "category_commission_configs" ADD COLUMN IF NOT EXISTS "cap_amount_cents" integer;
--> statement-breakpoint
ALTER TABLE "category_commission_configs" ADD COLUMN IF NOT EXISTS "floor_amount_cents" integer;
--> statement-breakpoint
ALTER TABLE "category_commission_config_versions" ADD COLUMN IF NOT EXISTS "cap_amount_cents" integer;
--> statement-breakpoint
ALTER TABLE "category_commission_config_versions" ADD COLUMN IF NOT EXISTS "floor_amount_cents" integer;
--> statement-breakpoint
-- Extend fn_emit_commission_config_version to include cap/floor in snapshot INSERT.
-- (CREATE OR REPLACE — same AFTER INSERT trigger from 0034 continues to bind.)
CREATE OR REPLACE FUNCTION fn_emit_commission_config_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM category_commission_config_versions
    WHERE category_id = NEW.category_id;

  INSERT INTO category_commission_config_versions
    (category_id, config_id, version_number, payment_type, is_conditional,
     max_coaches, max_per_cycle_cents, exclude_if_discount_above_pct,
     cap_amount_cents, floor_amount_cents, created_by)
  VALUES
    (NEW.category_id, NEW.id, next_version, NEW.payment_type, NEW.is_conditional,
     NEW.max_coaches, NEW.max_per_cycle_cents, NEW.exclude_if_discount_above_pct,
     NEW.cap_amount_cents, NEW.floor_amount_cents, 'system');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. payouts — drop NOT NULL on appointment_id (P0 fix)
-- ============================================================
ALTER TABLE "payouts" ALTER COLUMN "appointment_id" DROP NOT NULL;

-- ============================================================
-- 6. sales_orders — add isComplimentary, complimentaryApprovedBy, walkInCustomerId
-- ============================================================
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "is_complimentary" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "complimentary_approved_by" text;
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "walk_in_customer_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sales_orders"
		ADD CONSTRAINT "sales_orders_walk_in_customer_id_fk"
		FOREIGN KEY ("walk_in_customer_id") REFERENCES "walk_in_customers"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_walk_in_customer_idx"
	ON "sales_orders" ("walk_in_customer_id");

-- ============================================================
-- 7. sales_order_items — add tax snapshot cols
-- ============================================================
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "tax_rate_bps" integer;
--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "tax_rate_code" text;

-- ============================================================
-- 8. payment_items — add tax snapshot cols
-- ============================================================
ALTER TABLE "payment_items" ADD COLUMN IF NOT EXISTS "tax_rate_bps" integer;
--> statement-breakpoint
ALTER TABLE "payment_items" ADD COLUMN IF NOT EXISTS "tax_rate_code" text;

-- ============================================================
-- 9. transfer_order_items — add damaged_qty
-- ============================================================
ALTER TABLE "transfer_order_items" ADD COLUMN IF NOT EXISTS "damaged_qty" integer;

-- ============================================================
-- 10. stock_request_items — add approved_qty
-- ============================================================
ALTER TABLE "stock_request_items" ADD COLUMN IF NOT EXISTS "approved_qty" integer;

-- ============================================================
-- 11. google_calendar_connections — add encryption_key_id, token_rotated_at
-- ============================================================
ALTER TABLE "google_calendar_connections" ADD COLUMN IF NOT EXISTS "encryption_key_id" text;
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN IF NOT EXISTS "token_rotated_at" timestamptz;

-- ============================================================
-- 12. check_ins — add FK on existing package_instance_id + index
-- ============================================================
DO $$ BEGIN
	ALTER TABLE "check_ins"
		ADD CONSTRAINT "check_ins_package_instance_id_fk"
		FOREIGN KEY ("package_instance_id") REFERENCES "package_instances"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "check_ins_package_instance_idx"
	ON "check_ins" ("package_instance_id");

-- ============================================================
-- 13. commission_split_reversals — add 2 missing indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS "commission_split_reversals_payout_adj_idx"
	ON "commission_split_reversals" ("payout_adjustment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commission_split_reversals_reversed_by_idx"
	ON "commission_split_reversals" ("reversed_by_reversal_id");

-- ============================================================
-- 14. promotion_usages — migrate sales_order_id from text → uuid with FK
-- ============================================================
-- Drop unique index that includes the text column first
DROP INDEX IF EXISTS "promo_usages_unique_customer_order";
--> statement-breakpoint
-- Add new uuid column
ALTER TABLE "promotion_usages" ADD COLUMN IF NOT EXISTS "sales_order_id_new" uuid;
--> statement-breakpoint
-- Backfill: cast only well-formed UUIDs (no-op on dev; safe for prod rows)
UPDATE "promotion_usages"
	SET "sales_order_id_new" = "sales_order_id"::uuid
	WHERE "sales_order_id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
--> statement-breakpoint
-- Drop old text column
ALTER TABLE "promotion_usages" DROP COLUMN IF EXISTS "sales_order_id";
--> statement-breakpoint
-- Rename new column into place
ALTER TABLE "promotion_usages" RENAME COLUMN "sales_order_id_new" TO "sales_order_id";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "promotion_usages"
		ADD CONSTRAINT "promotion_usages_sales_order_id_fk"
		FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- Recreate unique index with uuid column
CREATE UNIQUE INDEX IF NOT EXISTS "promo_usages_unique_customer_order"
	ON "promotion_usages" ("promotion_id", "customer_id", "sales_order_id");
--> statement-breakpoint
-- Non-unique lookup index
CREATE INDEX IF NOT EXISTS "promotion_usages_sales_order_idx"
	ON "promotion_usages" ("sales_order_id");
` },
	{ hash: "0047_add_composite_indexes", sql: `-- migration: 0047_add_composite_indexes
-- description: Add composite indexes for hot query patterns (Phase 7.4)
--   commission_splits: (staff_id, status, earned_at DESC) for payout queries
--   sales_orders:      (customer_id, created_at DESC) for customer 360 view
--   payment_items:     (payment_id, item_type) for payment breakdown
-- Idempotent — safe to re-run.

CREATE INDEX IF NOT EXISTS "commission_splits_staff_status_earned_idx"
  ON "commission_splits" ("staff_id", "status", "earned_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_customer_created_idx"
  ON "sales_orders" ("customer_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_items_payment_type_idx"
  ON "payment_items" ("payment_id", "item_type");
` },
	{ hash: "0048_supplier_invoice_new_cols", sql: `-- migration: 0048_supplier_invoice_new_cols
-- description: Add dispute, paid, and payment reference columns to supplier_invoices.
--   dispute_reason: text stored when finance disputes a matched/pending invoice
--   disputed_at:    timestamp of when the dispute was raised
--   paid_at:        timestamp of when finance marked the invoice as paid
--   paid_by:        cross-db member.userId who marked as paid
--   payment_reference: optional bank transfer reference for audit trail
-- All columns nullable — zero downtime, fully backward-compatible.

ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "dispute_reason" text;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "disputed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "paid_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "paid_by" text;
--> statement-breakpoint
ALTER TABLE "supplier_invoices" ADD COLUMN IF NOT EXISTS "payment_reference" text;
` },
	{ hash: "0049_add_recurring_occurrence_unique_idx", sql: `-- migration: 0049_add_recurring_occurrence_unique_idx
-- description: Add a partial unique index on (recurring_parent_id, start_time) for appointments.
--   Prevents concurrent materialization from creating duplicate occurrence rows for the same
--   parent appointment + date. Partial (WHERE recurring_parent_id IS NOT NULL) so it only
--   applies to child (materialized occurrence) rows, not to parent or standalone appointments.
--   Zero downtime — CREATE UNIQUE INDEX IF NOT EXISTS is safe on existing data because
--   no recurring appointments exist yet.

CREATE UNIQUE INDEX IF NOT EXISTS "appointments_recurring_occurrence_unique_idx"
ON "appointments" ("recurring_parent_id", "start_time")
WHERE "recurring_parent_id" IS NOT NULL;
` },
	{ hash: "0050_add_is_recurring_idx", sql: `-- migration: 0050_add_is_recurring_idx
-- description: Add an index on is_recurring for the appointments table.
--   Used by listAppointmentsWithRecurrence to efficiently find recurring
--   parent appointments when expanding virtual occurrences.
--   Zero downtime — CREATE INDEX IF NOT EXISTS is safe on existing data.

CREATE INDEX IF NOT EXISTS "appointments_is_recurring_idx"
ON "appointments" ("is_recurring");
` },
	{ hash: "0051_ghl_per_branch_sync", sql: `CREATE TABLE IF NOT EXISTS "ghl_user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ghl_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"member_id" uuid NOT NULL,
	"branch_node_id" uuid NOT NULL,
	"ghl_location_id" text NOT NULL,
	"last_error" text,
	"sync_status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_contact_links_sync_status_idx";--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD COLUMN IF NOT EXISTS "branch_node_id" uuid;--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD COLUMN IF NOT EXISTS "ghl_location_id" text;--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD COLUMN IF NOT EXISTS "last_error" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_user_links_ghl_user_id_unique" ON "ghl_user_links" USING btree ("ghl_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_user_links_member_branch_unique" ON "ghl_user_links" USING btree ("member_id","branch_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_user_links_user_idx" ON "ghl_user_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_user_links_member_idx" ON "ghl_user_links" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_user_links_branch_idx" ON "ghl_user_links" USING btree ("branch_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_user_links_ghl_location_idx" ON "ghl_user_links" USING btree ("ghl_location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_user_links_sync_status_idx" ON "ghl_user_links" USING btree ("sync_status","last_synced_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_contact_links_customer_branch_unique" ON "ghl_contact_links" USING btree ("customer_profile_id","branch_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_contact_links_branch_idx" ON "ghl_contact_links" USING btree ("branch_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_contact_links_ghl_location_idx" ON "ghl_contact_links" USING btree ("ghl_location_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_contact_links_sync_status_idx" ON "ghl_contact_links" USING btree ("sync_status","last_synced_at");` },
	{ hash: "0051_sales_pipeline_fixes", sql: `-- migration: 0051_sales_pipeline_fixes
-- description: Schema additions for sales-pipeline-fixes session.
--   Phase 0 (branch QR onboarding): extend invitations table for self-signup invites.
--   Phase 1 (commission rule): add earn_reason to commission_splits.
--   Phase 5 (package lifecycle): add frozen_until to package_instances.
--   Open Q-2 Option B (commission deferral): add commission_deferred to sales_order_items.
--   Phase 4 (trainer view): add (assigned_trainer_id, status) index.
--   Reconciliation links: add sales_order_id to installments + package_instances.
-- All additive, all IF NOT EXISTS — zero downtime, fully backward-compatible.

-- ===== Phase 0: branch QR onboarding =====

ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'staff';
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "uses_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "max_uses" integer;
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_kind_branch_idx"
  ON "invitations" ("kind", "hierarchy_scope_id") WHERE "kind" = 'branch_self_signup';

-- ===== Phase 1: commission rule alignment =====
--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "earn_reason" text;

-- ===== Phase 5: package-instance lifecycle =====
--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN IF NOT EXISTS "frozen_until" timestamp with time zone;

-- ===== Open Q-2 Option B: commission deferral flag =====
--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN IF NOT EXISTS "commission_deferred" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_order_items_commission_deferred_idx"
  ON "sales_order_items" ("created_at") WHERE "commission_deferred" = true;

-- ===== Reconciliation FKs =====
--> statement-breakpoint
ALTER TABLE "installments" ADD COLUMN IF NOT EXISTS "sales_order_id" uuid REFERENCES "sales_orders"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "installments_sales_order_id_idx" ON "installments" ("sales_order_id");
--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN IF NOT EXISTS "sales_order_id" uuid REFERENCES "sales_orders"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "package_instances_sales_order_id_idx" ON "package_instances" ("sales_order_id");

-- ===== Phase 4: trainer assigned-packages query index =====
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "package_instances_assigned_trainer_status_idx"
  ON "package_instances" ("assigned_trainer_id", "status");
` },
	{ hash: "0052_add_members_deleted_at", sql: `ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_deleted_at_idx" ON "members" USING btree ("deleted_at");
` },
	{ hash: "0052_relax_commission_split_constraint", sql: `-- migration: 0052_relax_commission_split_constraint
-- description: Relax commission_splits_source_check to allow manual adjustments
--   that don't target an appointment/sales-order/package-instance.
--
-- Background: migration 0046 added a "exactly one of (appointment_id |
-- sales_order_id | package_instance_id) must be NOT NULL" constraint, which
-- broke commissionSplits.createManualAdjustment (it sets all three to NULL).
-- Surfaced by the e2e payouts-confirm-creates-row spec.
--
-- New rule: manual adjustments may have zero or one target FK; everything
-- else still requires exactly one.

ALTER TABLE "commission_splits" DROP CONSTRAINT IF EXISTS "commission_splits_source_check";
--> statement-breakpoint

ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_source_check"
	CHECK (
		(
			split_type = 'manual'
			AND ((appointment_id IS NOT NULL)::int +
			     (sales_order_id IS NOT NULL)::int +
			     (package_instance_id IS NOT NULL)::int) <= 1
		)
		OR
		(
			split_type <> 'manual'
			AND ((appointment_id IS NOT NULL)::int +
			     (sales_order_id IS NOT NULL)::int +
			     (package_instance_id IS NOT NULL)::int) = 1
		)
	) NOT VALID;
--> statement-breakpoint

ALTER TABLE "commission_splits" VALIDATE CONSTRAINT "commission_splits_source_check";
` },
	{ hash: "0053_coach_slot_weightage_check", sql: `-- migration: 0053_coach_slot_weightage_check
-- description: Enforce that commission_coach_slots.weightage_basis_points
--   sums to 10000 (= 100%) per category_commission_configs.config_id.
--
-- Background: audit-swarm scalability lens flagged that there is no
-- DB-level guarantee a commission config has weightages totalling 100%.
-- A misconfigured config would silently misallocate commission to slots.
--
-- Implementation: deferred constraint-trigger (a regular CHECK can't
-- aggregate across rows). Runs at COMMIT, so multi-row inserts inside a
-- transaction (the normal admin-edit pattern) finish before validation.
--
-- Special cases:
--   - Empty config (0 slots) → allowed; the engine just won't fire splits.
--   - Single slot at 10000 → allowed.
--   - Sum < 10000 OR > 10000 → rejected with a readable message.
--
-- Idempotent: DROP IF EXISTS on both the function and trigger.

-- 1. Validation function — sums weightages for the affected config_id and
--    raises if the total is non-zero AND not exactly 10000.
CREATE OR REPLACE FUNCTION validate_coach_slot_weightage_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_config_id uuid;
  v_total integer;
BEGIN
  v_config_id := COALESCE(NEW.config_id, OLD.config_id);

  SELECT COALESCE(SUM(weightage_basis_points), 0)
    INTO v_total
    FROM commission_coach_slots
    WHERE config_id = v_config_id;

  IF v_total <> 0 AND v_total <> 10000 THEN
    RAISE EXCEPTION
      'commission_coach_slots weightages for config % must sum to 10000 bp (100%%); got % bp',
      v_config_id, v_total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

-- 2. Deferred constraint trigger — fires AFTER INSERT/UPDATE/DELETE on each
--    row, but the actual validation runs at COMMIT (deferred). This lets a
--    multi-row INSERT or UPDATE complete before checking the sum.
DROP TRIGGER IF EXISTS commission_coach_slots_weightage_check
  ON commission_coach_slots;

CREATE CONSTRAINT TRIGGER commission_coach_slots_weightage_check
  AFTER INSERT OR UPDATE OR DELETE ON commission_coach_slots
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION validate_coach_slot_weightage_total();
` },
	{ hash: "0053_hierarchy_rename_region_state", sql: `-- Phase H1: rename hierarchy 'region' → 'state', shift branch depth 4 → 3.
-- Prerequisite: zero rows with type='area' (run flatten-areas.ts first per tenant).
-- Idempotent: WHERE clauses make repeat runs no-op.
--
-- IMPORTANT: compare via type::text, NOT \`type = 'area'\`/\`type = 'region'\`.
-- 'area' and 'region' are legacy enum labels that later migrations remove from
-- the hierarchy_node_type enum. On a tenant whose enum no longer contains them,
-- a bare \`type = 'region'\` makes Postgres cast the literal to the enum and fail
-- with \`invalid input value for enum hierarchy_node_type: "region"\` (22P02)
-- before any row is examined. Casting the column to text sidesteps the enum cast
-- so this migration is a true no-op when those values are already gone.

-- Safety: hard-fail if area rows still exist
DO $$
DECLARE area_count int;
BEGIN
  SELECT count(*) INTO area_count FROM hierarchy_nodes WHERE type::text = 'area';
  IF area_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % area row(s) exist. Run flatten-areas.ts first.', area_count;
  END IF;
END $$;
--> statement-breakpoint

UPDATE hierarchy_nodes SET type = 'state', updated_at = now() WHERE type::text = 'region';
--> statement-breakpoint

UPDATE hierarchy_nodes SET depth = 3, updated_at = now() WHERE type = 'branch' AND depth = 4;
` },
	{ hash: "0054_hierarchy_country_fk_archived_at", sql: `-- Phase G0: add country_node_id denorm FK + archived_at soft archive on hierarchy_nodes.
-- Idempotent.

ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "country_node_id" uuid REFERENCES "hierarchy_nodes"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hierarchy_country_idx" ON "hierarchy_nodes" ("country_node_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hierarchy_archived_at_idx" ON "hierarchy_nodes" ("archived_at");
--> statement-breakpoint
-- Backfill country_node_id via recursive CTE for existing state + branch rows
WITH RECURSIVE ancestors AS (
  SELECT id, parent_id, type, id AS country_id FROM hierarchy_nodes WHERE type = 'country'
  UNION ALL
  SELECT h.id, h.parent_id, h.type, a.country_id
  FROM hierarchy_nodes h JOIN ancestors a ON h.parent_id = a.id
)
UPDATE hierarchy_nodes h SET country_node_id = a.country_id, updated_at = now()
FROM ancestors a
WHERE h.id = a.id AND h.type IN ('state', 'branch') AND h.country_node_id IS NULL;
` },
	{ hash: "0054_sales_orders_refund_status", sql: `-- migration: 0054_sales_orders_refund_status
-- description: Add refund_status + refunded_amount_cents to sales_orders, backfill from refunds table.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Create enum sales_order_refund_status
-- ============================================================
DO $$ BEGIN
	CREATE TYPE "sales_order_refund_status" AS ENUM ('none', 'pending', 'partial', 'processed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================
-- 2. Add columns to sales_orders
-- ============================================================
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "refund_status" "sales_order_refund_status" NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "refunded_amount_cents" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- ============================================================
-- 3. Index
-- ============================================================
CREATE INDEX IF NOT EXISTS "sales_orders_refund_status_created_idx"
	ON "sales_orders" ("refund_status", "created_at" DESC);
--> statement-breakpoint

-- ============================================================
-- 4. Backfill from refunds table
--    refunds.status: 'processed' → 'processed', others → 'pending'
--    refunds.amount_cents used for refunded_amount_cents
-- ============================================================
UPDATE "sales_orders" so
SET
	"refund_status" = CASE
		WHEN r.max_status = 'processed' THEN 'processed'::"sales_order_refund_status"
		ELSE 'pending'::"sales_order_refund_status"
	END,
	"refunded_amount_cents" = COALESCE(r.total_amount, 0)
FROM (
	SELECT
		sales_order_id,
		MAX(status) AS max_status,
		SUM(amount_cents) AS total_amount
	FROM "refunds"
	WHERE sales_order_id IS NOT NULL
	GROUP BY sales_order_id
) r
WHERE so.id = r.sales_order_id
  AND r.sales_order_id IS NOT NULL;
` },
	{ hash: "0055_ghl_links_single_entity_unique", sql: `-- Phase G: flip ghl_contact_links and ghl_user_links unique constraints from
-- (entity, branch) → (entity). Reflects org-shared GHL model: one customer
-- maps to ONE GHL contact per org; one member maps to ONE GHL user per org.

-- Pre-flight: detect duplicate (customer_profile_id) rows that would block the
-- new unique. If any tenant has >1 row per customer, hard-fail with a clear
-- message so the operator can dedupe before retrying.
DO $$
DECLARE
  dup_count int;
  offending_ids text;
BEGIN
  SELECT count(*), string_agg(customer_profile_id::text, ', ')
    INTO dup_count, offending_ids
  FROM (
    SELECT customer_profile_id FROM ghl_contact_links
    GROUP BY customer_profile_id HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % customer_profile_id(s) in ghl_contact_links have multiple rows. Offending: %. Dedupe before applying.', dup_count, offending_ids;
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  dup_count int;
  offending_ids text;
BEGIN
  SELECT count(*), string_agg(member_id::text, ', ')
    INTO dup_count, offending_ids
  FROM (
    SELECT member_id FROM ghl_user_links
    GROUP BY member_id HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % member_id(s) in ghl_user_links have multiple rows. Offending: %. Dedupe before applying.', dup_count, offending_ids;
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_contact_links_customer_branch_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "ghl_user_links_member_branch_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_contact_links_customer_unique" ON "ghl_contact_links" ("customer_profile_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_user_links_member_unique" ON "ghl_user_links" ("member_id");
` },
	{ hash: "0055_sales_orders_cancellation_category", sql: `-- migration: 0055_sales_orders_cancellation_category
-- description: Add cancellation_reason_category enum column to sales_orders.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Create enum cancellation_reason_category
-- ============================================================
DO $$ BEGIN
	CREATE TYPE "cancellation_reason_category" AS ENUM (
		'customer_changed_mind',
		'payment_failed',
		'wrong_item',
		'fraud_suspected',
		'system_error',
		'other'
	);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================
-- 2. Add nullable column to sales_orders
-- ============================================================
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_reason_category" "cancellation_reason_category";
--> statement-breakpoint

-- ============================================================
-- 3. Partial index (only rows that have a category set)
-- ============================================================
CREATE INDEX IF NOT EXISTS "sales_orders_cancellation_category_idx"
	ON "sales_orders" ("cancellation_reason_category", "created_at" DESC)
	WHERE "cancellation_reason_category" IS NOT NULL;
` },
	{ hash: "0056_hierarchy_name_uniqueness", sql: `-- Phase H-hygiene: prevent duplicate sibling rows by enforcing uniqueness
-- on the (parent_id, name) key per type. App layer already validates this
-- on insert (hierarchy_validation.service.ts), but the DB-level constraint
-- catches programmatic inserts that bypass the service.
-- Note: existing branch-name partial unique covers the leaf level globally.

-- 1. Pre-flight dedup checks (hard-fail with actionable message).
-- The orchestrator will run merge-duplicate-siblings.ts on affected tenants
-- before applying this migration. CREATE UNIQUE INDEX would itself error if
-- duplicates exist, but the explicit checks give a clearer remediation hint.
DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT name FROM hierarchy_nodes
    WHERE type = 'country' AND archived_at IS NULL
    GROUP BY name HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % duplicate country name(s) exist. Run merge-duplicate-siblings.ts first.', dup_count;
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT parent_id, name FROM hierarchy_nodes
    WHERE type = 'state' AND archived_at IS NULL
    GROUP BY parent_id, name HAVING count(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % duplicate state sibling(s) exist. Run merge-duplicate-siblings.ts first.', dup_count;
  END IF;
END $$;
--> statement-breakpoint
-- 2. Create the partial uniques (idempotent via IF NOT EXISTS).
-- Country names must be globally unique within an org (one tenant DB =
-- one org). No parent_id matching needed since the org root is the
-- only parent type=country can have.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_country_name_unique"
  ON "hierarchy_nodes" ("name")
  WHERE "type" = 'country' AND "archived_at" IS NULL;
--> statement-breakpoint
-- State names unique within their parent country.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_state_sibling_name_unique"
  ON "hierarchy_nodes" ("parent_id", "name")
  WHERE "type" = 'state' AND "archived_at" IS NULL;
` },
	{ hash: "0056_payouts_gross_deductions", sql: `-- migration: 0056_payouts_gross_deductions
-- description: Add gross_amount_cents + deductions_cents to payouts, backfill gross from existing amount col.
--   Existing column is "amount" (integer cents, pre-tax commission).
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Add gross_amount_cents (nullable for safe backfill)
-- ============================================================
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "gross_amount_cents" integer;
--> statement-breakpoint

-- ============================================================
-- 2. Add deductions_cents (NOT NULL default 0)
-- ============================================================
ALTER TABLE "payouts" ADD COLUMN IF NOT EXISTS "deductions_cents" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- ============================================================
-- 3. Backfill gross_amount_cents from existing amount column
-- ============================================================
UPDATE "payouts"
SET "gross_amount_cents" = "amount"
WHERE "gross_amount_cents" IS NULL;
` },
	{ hash: "0057_gcal_sync_direction_conflict_policy", sql: `-- migration: 0057_gcal_sync_direction_conflict_policy
-- description: Add sync_direction, conflict_policy enums + cached_calendar_list_json/at
--   to google_calendar_connections. last_sync_at already exists — NOT re-added.
--   Bundles Task 1.36 (cached_calendar_list_json + cached_calendar_list_at).
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Create enum gcal_sync_direction
-- ============================================================
DO $$ BEGIN
	CREATE TYPE "gcal_sync_direction" AS ENUM (
		'one_way_to_google',
		'one_way_from_google',
		'two_way'
	);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================
-- 2. Create enum gcal_conflict_policy
-- ============================================================
DO $$ BEGIN
	CREATE TYPE "gcal_conflict_policy" AS ENUM (
		'avantej_wins',
		'google_wins',
		'keep_both',
		'manual_review'
	);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ============================================================
-- 3. Add columns to google_calendar_connections
-- ============================================================
ALTER TABLE "google_calendar_connections"
	ADD COLUMN IF NOT EXISTS "sync_direction" "gcal_sync_direction" NOT NULL DEFAULT 'two_way';
--> statement-breakpoint
ALTER TABLE "google_calendar_connections"
	ADD COLUMN IF NOT EXISTS "conflict_policy" "gcal_conflict_policy" NOT NULL DEFAULT 'manual_review';
--> statement-breakpoint

-- ============================================================
-- 4. Task 1.36 — calendar list cache
-- ============================================================
ALTER TABLE "google_calendar_connections"
	ADD COLUMN IF NOT EXISTS "cached_calendar_list_json" text;
--> statement-breakpoint
ALTER TABLE "google_calendar_connections"
	ADD COLUMN IF NOT EXISTS "cached_calendar_list_at" timestamptz;
` },
	{ hash: "0057_hierarchy_type_enum", sql: `-- Phase H2: replace text-typed hierarchy_nodes.type with a Postgres enum
-- so future inserts can't smuggle in typos.
-- Idempotent: CREATE TYPE guarded via pg_type lookup; ALTER TABLE no-ops if
-- column is already the enum type.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hierarchy_node_type') THEN
    CREATE TYPE hierarchy_node_type AS ENUM ('organization', 'country', 'state', 'branch');
  END IF;
END $$;
--> statement-breakpoint

-- Pre-flight: any rows with a value outside the enum would block the cast.
-- Should be impossible post-H1, but verify.
-- Cast type::text throughout: on a tenant where the column is ALREADY the enum
-- (idempotent re-run), \`string_agg(type, ...)\` has no enum overload and fails
-- with \`function string_agg(hierarchy_node_type, unknown) does not exist\`.
DO $$
DECLARE bad_count int; bad_types text;
BEGIN
  SELECT count(DISTINCT type::text), string_agg(DISTINCT type::text, ', ')
    INTO bad_count, bad_types
  FROM hierarchy_nodes
  WHERE type::text NOT IN ('organization', 'country', 'state', 'branch');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % unexpected type value(s) in hierarchy_nodes: %', bad_count, bad_types;
  END IF;
END $$;
--> statement-breakpoint

-- Drop partial indexes that reference the type column; ALTER TYPE can't
-- proceed while a partial predicate compares enum to text literal.
DROP INDEX IF EXISTS "hierarchy_nodes_branch_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "hierarchy_country_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "hierarchy_state_sibling_name_unique";
--> statement-breakpoint

-- Convert the column. Cast via USING.
DO $$
DECLARE col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'hierarchy_nodes' AND column_name = 'type';
  IF col_type = 'text' THEN
    ALTER TABLE hierarchy_nodes
      ALTER COLUMN type TYPE hierarchy_node_type
      USING type::hierarchy_node_type;
  END IF;
END $$;
--> statement-breakpoint

-- Recreate partial indexes after type change.
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_nodes_branch_name_unique"
  ON "hierarchy_nodes" ("name") WHERE "type" = 'branch';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_country_name_unique"
  ON "hierarchy_nodes" ("name")
  WHERE "type" = 'country' AND "archived_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_state_sibling_name_unique"
  ON "hierarchy_nodes" ("parent_id", "name")
  WHERE "type" = 'state' AND "archived_at" IS NULL;
` },
	{ hash: "0058_commission_splits_indexes", sql: `-- migration: 0058_commission_splits_indexes
-- description: Add composite indexes for commission_splits staff+status queries.
--   Actual column names: staff_id, status, calculated_amount (verified from schema).
--   staffStatusEarnedIdx (staff_id, status, earned_at) already exists from prior migration.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. staff + status composite (lookup by staff for a given status)
-- ============================================================
CREATE INDEX IF NOT EXISTS "commission_splits_staff_status_idx"
	ON "commission_splits" ("staff_id", "status");
--> statement-breakpoint

-- ============================================================
-- 2. staff + status + calculated_amount (liability / payroll aggregate)
-- ============================================================
CREATE INDEX IF NOT EXISTS "commission_splits_staff_status_amount_idx"
	ON "commission_splits" ("staff_id", "status", "calculated_amount");
` },
	{ hash: "0058_hierarchy_slug", sql: `-- Phase H2: add stable per-node slug for URL routing / deep links.
-- Backfill from name; tighten to NOT NULL after backfill.

ALTER TABLE hierarchy_nodes ADD COLUMN IF NOT EXISTS slug text;
--> statement-breakpoint

-- Backfill slug = lower(name) with non-alphanumeric → '_'
UPDATE hierarchy_nodes
SET slug = trim(both '_' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))),
    updated_at = now()
WHERE slug IS NULL;
--> statement-breakpoint

-- Pre-flight: verify no NULLs remain before NOT NULL constraint.
DO $$
DECLARE null_count int;
BEGIN
  SELECT count(*) INTO null_count FROM hierarchy_nodes WHERE slug IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Migration blocked: % rows still have NULL slug after backfill', null_count;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE hierarchy_nodes ALTER COLUMN slug SET NOT NULL;
--> statement-breakpoint

-- Sibling-scope uniqueness: slug must be unique within parent (matches name-uniqueness behaviour).
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_sibling_slug_unique"
  ON "hierarchy_nodes" ("parent_id", "slug")
  WHERE "archived_at" IS NULL;
` },
	{ hash: "0059_branch_details_split", sql: `-- Phase H2: split branch-specific columns into branch_details table.
-- hierarchy_nodes.address + hierarchy_nodes.pic_user_id were only populated
-- on type='branch' rows; sparse columns on the parent table are a smell.

CREATE TABLE IF NOT EXISTS "branch_details" (
  "node_id" uuid PRIMARY KEY REFERENCES "hierarchy_nodes"("id") ON DELETE CASCADE,
  "address" text,
  "pic_user_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Backfill: move existing data from hierarchy_nodes for branch rows.
INSERT INTO "branch_details" ("node_id", "address", "pic_user_id")
SELECT id, address, pic_user_id FROM hierarchy_nodes
WHERE type = 'branch' AND (address IS NOT NULL OR pic_user_id IS NOT NULL)
ON CONFLICT (node_id) DO UPDATE SET
  address = EXCLUDED.address,
  pic_user_id = EXCLUDED.pic_user_id,
  updated_at = now();
--> statement-breakpoint

-- Drop the moved columns from hierarchy_nodes. IF EXISTS makes this idempotent.
ALTER TABLE "hierarchy_nodes" DROP COLUMN IF EXISTS "address";
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" DROP COLUMN IF EXISTS "pic_user_id";
--> statement-breakpoint

-- Index pic_user_id on branch_details for member lookups.
CREATE INDEX IF NOT EXISTS "branch_details_pic_user_idx" ON "branch_details" ("pic_user_id");
` },
	{ hash: "0059_branch_stats_cache", sql: `-- migration: 0059_branch_stats_cache
-- description: Create branch_stats_cache table for write-through branch aggregate caching.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Create table
-- ============================================================
CREATE TABLE IF NOT EXISTS "branch_stats_cache" (
	"hierarchy_node_id" uuid PRIMARY KEY REFERENCES "hierarchy_nodes"("id") ON DELETE CASCADE,
	"members_count" integer NOT NULL DEFAULT 0,
	"staff_count" integer NOT NULL DEFAULT 0,
	"month_revenue_cents" integer NOT NULL DEFAULT 0,
	"month_revenue_period_start" timestamp with time zone NOT NULL DEFAULT date_trunc('month', NOW()),
	"computed_at" timestamp with time zone NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- ============================================================
-- 2. Index on computed_at for staleness checks
-- ============================================================
CREATE INDEX IF NOT EXISTS "branch_stats_cache_computed_at_idx"
	ON "branch_stats_cache" ("computed_at");
` },
	{ hash: "0060_appointment_payment_columns", sql: `-- Plan B Phase 2 — Direct Charge payment columns on appointments.
--
-- Adds Stripe Connect Direct-Charge tracking fields to existing appointments
-- table. No new payments table — Phase 2 is one-shot charge per appointment;
-- refund history + retry audit deferred to Phase 3.
--
-- Phase 4 readiness: stripe_connect_account_id_snapshot captures the acct ID
-- at charge time so historical rows stay valid when the account ID migrates
-- from organizations.stripe_connect_account_id to per-country
-- hierarchy_nodes.stripe_connect_account_id (Phase 4 ADR-pending).

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "currency" text NOT NULL DEFAULT 'MYR',
  ADD COLUMN IF NOT EXISTS "application_fee_amount" integer,
  ADD COLUMN IF NOT EXISTS "stripe_connect_account_id_snapshot" text,
  ADD COLUMN IF NOT EXISTS "stripe_payment_link_id" text,
  ADD COLUMN IF NOT EXISTS "payment_link_url" text,
  ADD COLUMN IF NOT EXISTS "paid_at" timestamp,
  ADD COLUMN IF NOT EXISTS "payment_failure_reason" text,
  ADD COLUMN IF NOT EXISTS "payment_method_type" text;
` },
	{ hash: "0060_sales_orders_repeat_offender_index", sql: `-- migration: 0060_sales_orders_repeat_offender_index
-- description: Partial index on sales_orders for repeat-offender (cancelled) customer lookups.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Partial index — cancelled orders per customer, sorted by date
-- ============================================================
CREATE INDEX IF NOT EXISTS "sales_orders_customer_status_created_idx"
	ON "sales_orders" ("customer_id", "status", "created_at" DESC)
	WHERE "status" = 'cancelled';
` },
	{ hash: "0061_customer_profile_stripe", sql: `-- Plan B Phase 3d — card-on-file support.
--
-- Each tenant client gets a Stripe Customer object on the tenant's Connect
-- account (NOT the platform). The PM saved via SetupIntent lives on that
-- Customer. Off-session charges later cite both ids.
--
-- Phase 4 readiness: the Stripe Customer id is scoped to the tenant's Connect
-- account snapshot. Multi-country branch acct migration will need a separate
-- Customer per acct (deferred — single org-level acct for now).

ALTER TABLE "customer_profiles"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_connect_account_id_snapshot" text,
  ADD COLUMN IF NOT EXISTS "default_payment_method_id" text;

CREATE INDEX IF NOT EXISTS "customer_profiles_stripe_customer_idx"
  ON "customer_profiles" ("stripe_customer_id");
` },
	{ hash: "0061_hierarchy_nodes_opening_hours", sql: `-- migration: 0061_hierarchy_nodes_opening_hours
-- description: Add opening_hours jsonb column to hierarchy_nodes (branch-level optional metadata).
--   address already exists — NOT re-added.
--   Idempotent — safe to re-run.

-- ============================================================
-- 1. Add opening_hours column (nullable jsonb)
-- ============================================================
ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "opening_hours" jsonb;
` },
	{ hash: "0062_hierarchy_align_address_pic", sql: `-- migration: 0062_hierarchy_align_address_pic
-- description: Restore address + pic_user_id columns on hierarchy_nodes if missing.
--   The Drizzle schema (packages/db/src/schema/tenant/hierarchy.ts) declares both
--   columns but some tenant DBs diverged from the schema. This is a defensive
--   alignment to keep \`SELECT * FROM hierarchy_nodes\` (and the query builder) safe.
--   Idempotent.

ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "address" text;
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "pic_user_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hierarchy_pic_user_idx" ON "hierarchy_nodes" ("pic_user_id");
` },
	{ hash: "0062_payments_link_columns", sql: `-- Plan B Phase 3c.1 — Payment Link columns on payments (POS online checkout).
--
-- Adds Stripe Payment Link tracking fields to the existing payments table so
-- POS sales recorded with paymentMethod="online" can store the generated
-- Stripe Payment Link URL + id + Connect acct snapshot. The webhook
-- (payment_intent.succeeded with metadata.type="sales_order") later flips
-- payments.status -> "succeeded" and cascades to invoices/sales_orders/
-- package_instances.
--
-- stripePaymentIntentId already has an index from the original payments
-- migration; no new indexes are needed here.

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "payment_link_url" text,
  ADD COLUMN IF NOT EXISTS "stripe_payment_link_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_connect_account_id_snapshot" text;
` },
	{ hash: "0063_account_groups", sql: `-- Phase 4 — Account groups for shared-email customers (e.g. family/friend
-- registrations from GHL forms where two customers share one inbox).
--
-- Adds an \`account_groups\` table that ties multiple \`customer_profiles\`
-- together under one primary login owner. Dependents have no \`user_id\`
-- (so they don't collide with \`user.email\` UNIQUE) and inherit access via
-- the primary's session in the Avantej UI.
--
-- All changes are additive:
--   * customer_profiles.user_id is relaxed to NULLABLE so dependents can
--     exist without a control-panel user row. The original
--     \`customer_profiles_user_idx\` UNIQUE index is dropped and replaced by
--     a PARTIAL UNIQUE index over non-null user_ids so primaries still get
--     1:1 enforcement.
--   * customer_profiles.account_group_id (nullable FK -> account_groups,
--     ON DELETE SET NULL) marks the dependent's group.
--   * customer_profiles.relationship (nullable text) captures free-form
--     tag like "family"/"friend"/"caregiver" set later by staff.
--
-- account_groups.primary_user_id stores the control-panel \`user.id\` of
-- the login owner. No FK constraint due to cross-database (control-panel
-- vs tenant). Application layer enforces referential integrity.

CREATE TABLE IF NOT EXISTS "account_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text,
  "primary_user_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "account_groups_primary_user_idx"
  ON "account_groups" ("primary_user_id");

ALTER TABLE "customer_profiles"
  ADD COLUMN IF NOT EXISTS "account_group_id" uuid REFERENCES "account_groups"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "relationship" text;

-- Drop the old TOTAL unique on user_id. Drizzle's \`.unique()\` historically
-- emitted both an index (\`customer_profiles_user_idx\`) and a named UNIQUE
-- CONSTRAINT (\`customer_profiles_user_id_unique\`) backed by its own index
-- (\`customer_profiles_user_id_unique\`). Drop all three so live tenants —
-- regardless of which generator they were provisioned by — converge on the
-- partial unique index declared below.
DROP INDEX IF EXISTS "customer_profiles_user_idx";
ALTER TABLE "customer_profiles" DROP CONSTRAINT IF EXISTS "customer_profiles_user_id_unique";
DROP INDEX IF EXISTS "customer_profiles_user_id_unique";

-- Relax user_id to NULL so dependents can exist without a user row.
ALTER TABLE "customer_profiles"
  ALTER COLUMN "user_id" DROP NOT NULL;

-- Re-enforce 1:1 user <-> customer_profile for primaries only.
CREATE UNIQUE INDEX IF NOT EXISTS "customer_profiles_user_id_unique_not_null"
  ON "customer_profiles" ("user_id") WHERE "user_id" IS NOT NULL;

-- Lookup index for dependents by group.
CREATE INDEX IF NOT EXISTS "customer_profiles_account_group_idx"
  ON "customer_profiles" ("account_group_id");
` },
	{ hash: "0063_service_default_commission_bps", sql: `-- Migration 0063: add default_commission_bps to services
-- Stores default commission rate in basis points (e.g. 1000 = 10.00%).
-- Idempotent: uses ADD COLUMN IF NOT EXISTS.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS default_commission_bps integer NOT NULL DEFAULT 0;
` },
	{ hash: "0064_announcements_requires_ack", sql: `ALTER TABLE announcements ADD COLUMN IF NOT EXISTS requires_acknowledgement boolean NOT NULL DEFAULT false;
` },
	{ hash: "0065_trainer_availability_kind", sql: `-- 0065_trainer_availability_kind.sql
-- Add a \`kind\` enum column to trainer_availability for Available / Blocked / Time-off slots.
-- Idempotent: safe to re-run on partially-migrated tenants.

-- 1. Create enum type (idempotent)
DO $$
BEGIN
  CREATE TYPE trainer_availability_kind AS ENUM ('available', 'blocked', 'timeoff');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add column with default so existing rows stay 'available'
ALTER TABLE trainer_availability
  ADD COLUMN IF NOT EXISTS kind trainer_availability_kind NOT NULL DEFAULT 'available';
` },
	{ hash: "0066_commission_condition_between_check", sql: `-- migration: 0066_commission_condition_between_check
-- description: Validate that commission_conditions with operator='between'
--   have threshold_max >= threshold. A reversed range (e.g. threshold=10,
--   threshold_max=5) makes every comparison \`n >= threshold AND n <= threshold_max\`
--   silently impossible, producing a zero-commission tier nobody notices.
--
-- Background: commission-calculator audit (round 2, flaw #16) — the engine
--   evaluates BETWEEN ranges with no input-side guard, so an admin typo
--   silently drops every commission this tier should have paid.
--
-- Constraint policy:
--   - operator='between'   → threshold_max IS NOT NULL AND threshold_max >= threshold
--   - operator='lt|lte|gt|gte|eq' → threshold_max IS NULL (or any value; ignored at calc time)
--
-- We enforce only the BETWEEN branch since the calculator only reads
-- threshold_max for that operator. Other operators with a stray threshold_max
-- are technically harmless but might confuse admins — out of scope for this
-- migration.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS then re-add.

ALTER TABLE "commission_conditions"
  DROP CONSTRAINT IF EXISTS "commission_conditions_between_range_valid";

ALTER TABLE "commission_conditions"
  ADD CONSTRAINT "commission_conditions_between_range_valid"
  CHECK (
    operator <> 'between'
    OR (threshold_max IS NOT NULL AND threshold_max >= threshold)
  );
` },
	{ hash: "0067_installments_waived_counter", sql: `-- Add installments_waived counter to package_instances
-- Tracks the number of installments administratively waived (distinct from paid or cancelled)
ALTER TABLE package_instances
  ADD COLUMN IF NOT EXISTS installments_waived integer NOT NULL DEFAULT 0;
` },
	{ hash: "0068_payment_method_unification", sql: `-- Backfill bank_transfer → manual_transfer across all payment-method columns
-- bank_transfer was the original POS value; manual_transfer is the canonical value used
-- by confirmInstallmentPayment and all downstream reporting.
UPDATE package_instances SET payment_method = 'manual_transfer' WHERE payment_method = 'bank_transfer';
UPDATE installments       SET payment_method = 'manual_transfer' WHERE payment_method = 'bank_transfer';
UPDATE invoices           SET payment_mode   = 'manual_transfer' WHERE payment_mode   = 'bank_transfer';
UPDATE payments           SET payment_method = 'manual_transfer' WHERE payment_method = 'bank_transfer';
` },
	{ hash: "0069_installments_due_index", sql: `-- Composite index for evaluateAndLockIfOverdue bulk sweep and getAdminInstallmentOverview EXISTS subquery
-- Covers: WHERE package_instance_id = ? AND status IN (...) AND due_date <= ?
CREATE INDEX IF NOT EXISTS idx_installments_pkg_status_due
  ON installments (package_instance_id, status, due_date);
` },
	{ hash: "0070_commission_governance", sql: `-- Flaw #9: price snapshot at booking (commission reads this, not live price)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price_snapshot_cents integer;

-- Flaw #10: pin commission config version at booking, not at completion (audit anchor only)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS config_version_id uuid
  REFERENCES category_commission_config_versions(id);

-- Flaw #11: appointment-level comp flag (no sales order required)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_complimentary boolean
  NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS complimentary_reason text;

-- Flaw #13: actor who created the manual adjustment, needed for Review tab "created by" display.
ALTER TABLE commission_splits ADD COLUMN IF NOT EXISTS created_by_user_id text;

-- Index to speed up the new Review tab query.
-- Both columns match the ORDER BY (earned_at DESC, id DESC) and the composite cursor
-- filter. A single-column index on earned_at alone cannot cover the id tie-breaker.
CREATE INDEX IF NOT EXISTS commission_splits_pending_review_idx
  ON commission_splits(earned_at DESC, id DESC)
  WHERE status = 'pending_review';
` },
	{ hash: "0071_commission_conditions_min_quantity", sql: `-- Flaw #7: add min_quantity to commission_conditions for POS tiered config matching.
-- NULL = "matches any quantity" (preserves first-condition-wins for existing configs).
ALTER TABLE commission_conditions ADD COLUMN IF NOT EXISTS min_quantity integer;
` },
	{ hash: "0072_customer_lead_acquisition_type", sql: `-- Persist the raw GHL lead_acquisition_type alongside the resolved lead_source FK,
-- so the value survives even when no lead_sources lookup row matches.
ALTER TABLE customer_profiles
	ADD COLUMN IF NOT EXISTS lead_acquisition_type text;
` },
	{ hash: "0073_customer_primary_staff_member", sql: `-- migration: 0073_customer_primary_staff_member
-- description: resolve the GHL lead webhook \`primary_staff\` to an Avantej member.
--   * customer_profiles.primary_staff_member_id: nullable FK -> members(id).
--   * ON DELETE SET NULL so the profile survives staff churn (mirrors referrer_member_id).
--   * Idempotent — safe to re-run; no enum types.
ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "primary_staff_member_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "customer_profiles"
		ADD CONSTRAINT "customer_profiles_primary_staff_member_id_fk"
		FOREIGN KEY ("primary_staff_member_id") REFERENCES "members"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_profiles_primary_staff_member_idx"
	ON "customer_profiles" ("primary_staff_member_id");
` },
] as const;

export const LATEST_MIGRATION_VERSION =
	TENANT_MIGRATIONS[TENANT_MIGRATIONS.length - 1]!.hash;
