/**
 * Tenant Database Migration Runner
 *
 * Applies tenant schema migrations to newly provisioned Neon projects.
 * This runs programmatically when a new tenant database is created.
 *
 * Migrations are embedded as SQL strings (Cloudflare Workers compatible).
 * Each migration follows the pattern: NNNN_description
 *
 * Usage:
 * ```typescript
 * import { runTenantMigrations } from "@avantej-core/db/migrate-tenant";
 *
 * await runTenantMigrations(connectionString);
 * ```
 *
 * Process:
 * 1. Creates migrations tracking table if it doesn't exist
 * 2. Executes migrations in order
 * 3. Tracks applied migrations to avoid re-running
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Configure WebSocket support
neonConfig.webSocketConstructor = ws;

/**
 * Type for Neon Pool client
 * Used for executing raw SQL in migrations
 */
type NeonPool = Pool;

/**
 * Tenant migration SQL (embedded for Cloudflare Workers compatibility)
 * Migration: 0000_noisy_aqueduct
 * Creates initial tenant schema: hierarchy_nodes, members, invitations
 */
const MIGRATION_0000_NOISY_AQUEDUCT = `
CREATE TABLE "hierarchy_nodes" (
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
CREATE INDEX "invitations_invited_by_idx" ON "invitations" USING btree ("invited_by");
`;

/**
 * Tenant migration SQL (embedded for Cloudflare Workers compatibility)
 * Migration: 0001_salty_morlocks
 * Creates services, packages, appointments, payments, and payout schemas
 */
const MIGRATION_0001_SALTY_MORLOCKS = `
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
`;

/**
 * Tenant migration SQL (embedded for Cloudflare Workers compatibility)
 * Migration: 0002_calm_martin_li
 * Creates RBAC tables (roles, permissions, role_permissions) and adds branch fields (address, pic_user_id)
 * 
 * This migration combines RBAC setup and branch-specific fields in a single migration,
 * matching the drizzle-kit generated migration file.
 */
const MIGRATION_0002_CALM_MARTIN_LI = `
CREATE TABLE "roles" (
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
CREATE INDEX "hierarchy_pic_user_idx" ON "hierarchy_nodes" USING btree ("pic_user_id");
`;

/**
 * Tenant migration SQL (embedded for Cloudflare Workers compatibility)
 * Migration: 0003_green_runaways
 * Adds soft delete support (deleted_at column) to hierarchy_nodes table
 */
const MIGRATION_0003_GREEN_RUNAWAYS = `
ALTER TABLE "hierarchy_nodes" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "hierarchy_deleted_at_idx" ON "hierarchy_nodes" USING btree ("deleted_at");
`;

/**
 * Tenant migration SQL (embedded for Cloudflare Workers compatibility)
 * Migration: 0004_remove_soft_delete
 * Removes soft delete support (deleted_at column) from hierarchy_nodes table - switching to hard delete
 */
const MIGRATION_0004_REMOVE_SOFT_DELETE = `
ALTER TABLE "hierarchy_nodes" DROP COLUMN IF EXISTS "deleted_at";--> statement-breakpoint
DROP INDEX IF EXISTS "hierarchy_deleted_at_idx";
`;

/**
 * Tenant migration SQL (embedded for Cloudflare Workers compatibility)
 * Migration: 0005_schema_enhancement
 * Adds mobile app support: customer profiles, notifications, package instances,
 * class scheduling, announcements, expenses, and enhanced service/appointment fields
 */
const MIGRATION_0005_SCHEMA_ENHANCEMENT = `
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
`;

/**
 * Tenant migration SQL (embedded for Cloudflare Workers compatibility)
 * Migration: 0005_confused_hitman
 * Adds GoHighLevel contact link/event tables and customer soft-delete fields.
 */
const MIGRATION_0005_CONFUSED_HITMAN = `
CREATE TABLE "ghl_contact_links" (
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
CREATE INDEX "customer_profiles_is_deleted_idx" ON "customer_profiles" USING btree ("is_deleted");
`;

/**
 * List of tenant migrations in order
 * Add new migrations here as they are created
 * 
 * IMPORTANT: Migrations should match drizzle-kit generated files in packages/db/src/migrations/tenant/
 * When adding new migrations:
 * 1. Update schema files in packages/db/src/schema/tenant/
 * 2. Run: bun run drizzle-kit generate --config=drizzle.tenant.config.ts
 * 3. Copy SQL from generated file into a new MIGRATION_XXXX constant above
 * 4. Add entry to TENANT_MIGRATIONS array with matching hash
 */
const TENANT_MIGRATIONS = [
  {
    hash: "0000_noisy_aqueduct",
    sql: MIGRATION_0000_NOISY_AQUEDUCT,
  },
  {
    hash: "0001_salty_morlocks",
    sql: MIGRATION_0001_SALTY_MORLOCKS,
  },
  {
    hash: "0002_calm_martin_li",
    sql: MIGRATION_0002_CALM_MARTIN_LI,
  },
  {
    hash: "0003_green_runaways",
    sql: MIGRATION_0003_GREEN_RUNAWAYS,
  },
  {
    hash: "0004_remove_soft_delete",
    sql: MIGRATION_0004_REMOVE_SOFT_DELETE,
  },
  {
    hash: "0005_schema_enhancement",
    sql: MIGRATION_0005_SCHEMA_ENHANCEMENT,
  },
  {
    hash: "0005_confused_hitman",
    sql: MIGRATION_0005_CONFUSED_HITMAN,
  },
] as const;

/**
 * The latest migration version hash
 * Used to track which schema version each tenant is on
 */
export const LATEST_MIGRATION_VERSION = TENANT_MIGRATIONS[TENANT_MIGRATIONS.length - 1].hash;

/**
 * SQL to create migrations tracking table
 */
const CREATE_MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS drizzle_migrations_hash_idx ON drizzle_migrations(hash);
`;

/**
 * Parse SQL migration file and split into individual statements
 * Drizzle migrations use '--> statement-breakpoint' as separators
 */
function parseMigrationSQL(sql: string): string[] {
  // Split by statement breakpoint, filter out empty strings and comments
  return sql
    .split("--> statement-breakpoint")
    .map((stmt) => stmt.trim())
    .filter((stmt) => {
      // Filter out empty statements and pure comment lines
      const cleaned = stmt.replace(/--.*$/gm, "").trim();
      return cleaned.length > 0;
    });
}

/**
 * Check if migration has already been applied
 */
async function isMigrationApplied(
  pool: NeonPool,
  hash: string
): Promise<boolean> {
  try {
    const result = (await pool.query(
      "SELECT 1 FROM drizzle_migrations WHERE hash = $1 LIMIT 1",
      [hash]
    )) as { rows: Array<{ "?column?": number }> };
    // Handle different return types from Neon Pool
    return result.rows.length > 0;
  } catch {
    // If table doesn't exist or query fails, assume not applied
    return false;
  }
}

/**
 * Execute raw SQL statement using Neon Pool
 * Uses Pool.query() method for raw SQL strings
 */
async function executeRawSQL(pool: NeonPool, sqlString: string): Promise<void> {
  // Use Pool.query() method for raw SQL execution
  await pool.query(sqlString);
}

/**
 * Mark migration as applied
 */
async function markMigrationApplied(
  pool: NeonPool,
  hash: string
): Promise<void> {
  await pool.query(
    "INSERT INTO drizzle_migrations (hash) VALUES ($1) ON CONFLICT (hash) DO NOTHING",
    [hash]
  );
}

/**
 * Run all tenant migrations on a newly created database
 *
 * @param connectionString - PostgreSQL connection string for the tenant database
 * @returns The final migration version hash that was applied (or already present)
 * @throws Error if migrations fail
 */
export async function runTenantMigrations(
  connectionString: string
): Promise<string> {
  if (!connectionString) {
    throw new Error("Connection string is required");
  }

  // Create Neon Pool client
  const pool = new Pool({ connectionString });

  try {
    // Step 1: Ensure migrations tracking table exists
    // Execute raw SQL by splitting into statements and executing each
    const createTableStatements = CREATE_MIGRATIONS_TABLE_SQL.trim()
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of createTableStatements) {
      if (statement.trim()) {
        await executeRawSQL(pool, statement);
      }
    }

    // Step 2: Execute each migration in order
    for (const migration of TENANT_MIGRATIONS) {
      const { hash, sql: migrationSQL } = migration;

      // Skip if already applied
      if (await isMigrationApplied(pool, hash)) {
        console.log(`Skipping already applied migration: ${hash}`);
        continue;
      }

      // Backward compatibility: Check if old split migrations were applied
      // If "0002_rbac_tables" and "0003_add_branch_fields" are both applied,
      // mark "0002_calm_martin_li" as applied (they're equivalent)
      if (hash === "0002_calm_martin_li") {
        const rbacApplied = await isMigrationApplied(pool, "0002_rbac_tables");
        const branchFieldsApplied = await isMigrationApplied(pool, "0003_add_branch_fields");
        if (rbacApplied && branchFieldsApplied) {
          console.log(`Migration ${hash} already applied via split migrations (0002_rbac_tables + 0003_add_branch_fields), marking as applied`);
          await markMigrationApplied(pool, hash);
          continue;
        }
      }

      console.log(`Applying migration: ${hash}`);

      // Parse into individual statements
      const statements = parseMigrationSQL(migrationSQL);

      // Execute each statement
      for (const statement of statements) {
        if (statement.trim()) {
          await executeRawSQL(pool, statement);
        }
      }

      // Mark migration as applied
      await markMigrationApplied(pool, hash);
      console.log(`Applied migration: ${hash}`);
    }

    console.log("All tenant migrations applied successfully");
    return LATEST_MIGRATION_VERSION;
  } catch (error) {
    console.error("Failed to run tenant migrations:", error);
    throw new Error(
      `Failed to run tenant migrations: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
