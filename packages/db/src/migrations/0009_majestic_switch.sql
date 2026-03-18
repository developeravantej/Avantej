CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'approved', 'ordered', 'partially_received', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."promotion_type" AS ENUM('percentage', 'fixed_amount', 'free_item', 'buy_x_get_y');--> statement-breakpoint
CREATE TABLE "organization_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"total_customers" integer DEFAULT 0 NOT NULL,
	"active_customers" integer DEFAULT 0 NOT NULL,
	"total_bookings" integer DEFAULT 0 NOT NULL,
	"completed_bookings" integer DEFAULT 0 NOT NULL,
	"cancelled_bookings" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"monthly_revenue" integer DEFAULT 0 NOT NULL,
	"active_package_instances" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_analytics_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "ghl_location_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"webhook_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"scope" text DEFAULT 'organization' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_permission_unique" UNIQUE("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"title" text,
	"description" text,
	"image_url" text,
	"type" text DEFAULT 'private' NOT NULL,
	"price" integer,
	"price_unit" text DEFAULT 'session',
	"taxable" boolean DEFAULT false NOT NULL,
	"tax_percentage" integer DEFAULT 0 NOT NULL,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"location" text,
	"features" text[],
	"scheduling_type" text DEFAULT 'appointment' NOT NULL
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"booking_number" text,
	"user_id" text,
	"trainer_id" uuid,
	"package_instance_id" uuid,
	"credits_used" integer DEFAULT 1,
	"location" text,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"class_slot_id" uuid,
	"description" text,
	"image_url" text,
	"room_id" uuid,
	CONSTRAINT "appointments_booking_number_unique" UNIQUE("booking_number")
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
	"user_id" text,
	"payment_number" text,
	"payment_method" text,
	"invoice_id" uuid,
	"e_invoice_status" text,
	"e_invoice_id" text,
	"refunded_at" timestamp,
	"refund_amount" integer,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "payments_payment_number_unique" UNIQUE("payment_number")
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
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"deleted_source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
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
	"promotion_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL,
	"total_price" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
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
	"customer_type" text DEFAULT 'member' NOT NULL,
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
ALTER TABLE "user" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_expires" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_connect_account_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_connect_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_connect_account_type" text DEFAULT 'franchiser' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_connect_onboarding_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "schema_version" text DEFAULT '0000';--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN "pic_user_id" text;--> statement-breakpoint
ALTER TABLE "organization_analytics" ADD CONSTRAINT "organization_analytics_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_location_links" ADD CONSTRAINT "ghl_location_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_trainer_id_members_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_package_instance_id_package_instances_id_fk" FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_class_slot_id_class_slots_id_fk" FOREIGN KEY ("class_slot_id") REFERENCES "public"."class_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_clients" ADD CONSTRAINT "appointment_clients_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_clients" ADD CONSTRAINT "appointment_clients_package_assignment_id_package_assignments_id_fk" FOREIGN KEY ("package_assignment_id") REFERENCES "public"."package_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_staff" ADD CONSTRAINT "appointment_staff_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_commission_split_id_commission_splits_id_fk" FOREIGN KEY ("commission_split_id") REFERENCES "public"."commission_splits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_members" ADD CONSTRAINT "service_members_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_members" ADD CONSTRAINT "service_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_category_config" ADD CONSTRAINT "service_category_config_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ghl_contact_links" ADD CONSTRAINT "ghl_contact_links_customer_profile_id_customer_profiles_id_fk" FOREIGN KEY ("customer_profile_id") REFERENCES "public"."customer_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_instances" ADD CONSTRAINT "package_instances_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_instances" ADD CONSTRAINT "package_instances_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferred_times" ADD CONSTRAINT "preferred_times_package_instance_id_package_instances_id_fk" FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_slots" ADD CONSTRAINT "class_slots_instructor_id_members_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_class_slot_id_class_slots_id_fk" FOREIGN KEY ("class_slot_id") REFERENCES "public"."class_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_in_customers" ADD CONSTRAINT "walk_in_customers_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_analytics_org_idx" ON "organization_analytics" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ghl_location_links_location_id_unique" ON "ghl_location_links" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "ghl_location_links_org_idx" ON "ghl_location_links" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ghl_location_links_active_idx" ON "ghl_location_links" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "roles_name_idx" ON "roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "roles_priority_idx" ON "roles" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "permissions_resource_idx" ON "permissions" USING btree ("resource");--> statement-breakpoint
CREATE INDEX "role_permissions_role_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "role_permissions_scope_idx" ON "role_permissions" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "role_permissions_role_scope_idx" ON "role_permissions" USING btree ("role_id","scope");--> statement-breakpoint
CREATE INDEX "service_categories_branch_idx" ON "service_categories" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "service_categories_active_idx" ON "service_categories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "service_categories_order_idx" ON "service_categories" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "services_branch_idx" ON "services" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "services_stripe_product_idx" ON "services" USING btree ("stripe_product_id");--> statement-breakpoint
CREATE INDEX "services_stripe_sync_status_idx" ON "services" USING btree ("stripe_sync_status");--> statement-breakpoint
CREATE INDEX "services_active_idx" ON "services" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "services_type_idx" ON "services" USING btree ("type");--> statement-breakpoint
CREATE INDEX "services_recommended_idx" ON "services" USING btree ("is_recommended");--> statement-breakpoint
CREATE INDEX "services_scheduling_type_idx" ON "services" USING btree ("scheduling_type");--> statement-breakpoint
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
CREATE INDEX "appointments_booking_number_idx" ON "appointments" USING btree ("booking_number");--> statement-breakpoint
CREATE INDEX "appointments_user_idx" ON "appointments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "appointments_trainer_idx" ON "appointments" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX "appointments_package_instance_idx" ON "appointments" USING btree ("package_instance_id");--> statement-breakpoint
CREATE INDEX "appointments_class_slot_idx" ON "appointments" USING btree ("class_slot_id");--> statement-breakpoint
CREATE INDEX "appointments_user_status_idx" ON "appointments" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "appointments_room_idx" ON "appointments" USING btree ("room_id");--> statement-breakpoint
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
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_payment_number_idx" ON "payments" USING btree ("payment_number");--> statement-breakpoint
CREATE INDEX "payments_payment_method_idx" ON "payments" USING btree ("payment_method");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_e_invoice_status_idx" ON "payments" USING btree ("e_invoice_status");--> statement-breakpoint
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
CREATE INDEX "payouts_recipient_status_idx" ON "payouts" USING btree ("recipient_id","status");--> statement-breakpoint
CREATE INDEX "member_profiles_member_idx" ON "member_profiles" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_members_unique_idx" ON "service_members" USING btree ("service_id","member_id");--> statement-breakpoint
CREATE INDEX "service_members_service_idx" ON "service_members" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "service_members_member_idx" ON "service_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "service_category_config_category_idx" ON "service_category_config" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "service_category_config_incentive_idx" ON "service_category_config" USING btree ("incentive_type");--> statement-breakpoint
CREATE INDEX "customer_profiles_user_idx" ON "customer_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customer_profiles_credits_idx" ON "customer_profiles" USING btree ("credit_points");--> statement-breakpoint
CREATE INDEX "customer_profiles_is_deleted_idx" ON "customer_profiles" USING btree ("is_deleted");--> statement-breakpoint
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
CREATE INDEX "notification_preferences_user_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "user_activity_log_user_idx" ON "user_activity_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_activity_log_type_idx" ON "user_activity_log" USING btree ("activity_type");--> statement-breakpoint
CREATE INDEX "user_activity_log_user_created_idx" ON "user_activity_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "package_instances_package_idx" ON "package_instances" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "package_instances_client_idx" ON "package_instances" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "package_instances_source_idx" ON "package_instances" USING btree ("source");--> statement-breakpoint
CREATE INDEX "package_instances_status_idx" ON "package_instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "package_instances_payment_status_idx" ON "package_instances" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "package_instances_expires_idx" ON "package_instances" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "package_instances_client_status_idx" ON "package_instances" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "package_instances_purchase_number_idx" ON "package_instances" USING btree ("purchase_number");--> statement-breakpoint
CREATE INDEX "preferred_times_package_instance_idx" ON "preferred_times" USING btree ("package_instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preferred_times_package_priority_idx" ON "preferred_times" USING btree ("package_instance_id","priority");--> statement-breakpoint
CREATE INDEX "class_slots_service_idx" ON "class_slots" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "class_slots_branch_idx" ON "class_slots" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "class_slots_date_idx" ON "class_slots" USING btree ("date");--> statement-breakpoint
CREATE INDEX "class_slots_service_date_time_idx" ON "class_slots" USING btree ("service_id","date","start_time");--> statement-breakpoint
CREATE INDEX "class_slots_available_idx" ON "class_slots" USING btree ("is_available","is_full","date");--> statement-breakpoint
CREATE INDEX "class_slots_instructor_idx" ON "class_slots" USING btree ("instructor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_slot_user_idx" ON "waitlist_entries" USING btree ("class_slot_id","user_id");--> statement-breakpoint
CREATE INDEX "waitlist_entries_slot_idx" ON "waitlist_entries" USING btree ("class_slot_id");--> statement-breakpoint
CREATE INDEX "waitlist_entries_user_idx" ON "waitlist_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "waitlist_entries_status_idx" ON "waitlist_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "waitlist_entries_slot_status_position_idx" ON "waitlist_entries" USING btree ("class_slot_id","status","position");--> statement-breakpoint
CREATE INDEX "recurrence_rules_appointment_idx" ON "recurrence_rules" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "announcements_branch_idx" ON "announcements" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "announcements_active_idx" ON "announcements" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "announcements_priority_idx" ON "announcements" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "announcements_target_idx" ON "announcements" USING btree ("target_audience");--> statement-breakpoint
CREATE INDEX "announcements_date_range_idx" ON "announcements" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "announcements_active_visible_idx" ON "announcements" USING btree ("is_active","start_date","end_date");--> statement-breakpoint
CREATE INDEX "expenses_branch_idx" ON "expenses" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "expenses_submitted_by_idx" ON "expenses" USING btree ("submitted_by");--> statement-breakpoint
CREATE INDEX "expenses_status_idx" ON "expenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "expenses_submitter_status_idx" ON "expenses" USING btree ("submitted_by","status");--> statement-breakpoint
CREATE INDEX "payment_items_payment_idx" ON "payment_items" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_items_type_idx" ON "payment_items" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "payment_items_item_idx" ON "payment_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "payment_items_promotion_idx" ON "payment_items" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "rooms_branch_idx" ON "rooms" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "rooms_is_active_idx" ON "rooms" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sales_orders_number_idx" ON "sales_orders" USING btree ("sales_order_number");--> statement-breakpoint
CREATE INDEX "sales_orders_customer_idx" ON "sales_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sales_orders_created_by_idx" ON "sales_orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "sales_orders_branch_idx" ON "sales_orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "sales_orders_date_idx" ON "sales_orders" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sales_orders_status_idx" ON "sales_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sales_orders_customer_type_idx" ON "sales_orders" USING btree ("customer_type");--> statement-breakpoint
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
CREATE INDEX "organizations_stripe_connect_idx" ON "organizations" USING btree ("stripe_connect_account_id");--> statement-breakpoint
CREATE INDEX "hierarchy_pic_user_idx" ON "hierarchy_nodes" USING btree ("pic_user_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_stripe_connect_account_id_unique" UNIQUE("stripe_connect_account_id");