CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_member_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"branch_id" uuid,
	"summary" text NOT NULL,
	"changes" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_type" text NOT NULL,
	"client_id" text NOT NULL,
	"branch_id" uuid NOT NULL,
	"appointment_client_id" uuid,
	"source" text NOT NULL,
	"outcome" text DEFAULT 'attended' NOT NULL,
	"package_instance_id" uuid,
	"credits_consumed" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"checked_in_by" text NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_member_id" uuid NOT NULL,
	"impersonated_member_id" uuid NOT NULL,
	"admin_user_id" text NOT NULL,
	"impersonated_user_id" text NOT NULL,
	"session_token" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "member_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sales_order_id" uuid,
	"payment_id" uuid,
	"package_instance_id" uuid,
	"amount_cents" integer NOT NULL,
	"tax_amount_cents" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"processed_by" text,
	"processed_at" timestamp with time zone,
	"refund_method" text,
	"refund_reference" text,
	"branch_id" uuid,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_refund_number_unique" UNIQUE("refund_number")
);
--> statement-breakpoint
DROP INDEX "commission_splits_unique_idx";--> statement-breakpoint
ALTER TABLE "commission_splits" ALTER COLUMN "appointment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "sales_order_id" uuid;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "paid_by" text;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commission_splits" ADD COLUMN "payout_id" uuid;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD COLUMN "price_premium_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_appointment_client_id_appointment_clients_id_fk" FOREIGN KEY ("appointment_client_id") REFERENCES "public"."appointment_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_sessions" ADD CONSTRAINT "member_sessions_admin_member_id_members_id_fk" FOREIGN KEY ("admin_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_sessions" ADD CONSTRAINT "member_sessions_impersonated_member_id_members_id_fk" FOREIGN KEY ("impersonated_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_package_instance_id_package_instances_id_fk" FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_branch_id_hierarchy_nodes_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_branch_idx" ON "audit_logs" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "check_ins_client_idx" ON "check_ins" USING btree ("client_type","client_id","checked_in_at");--> statement-breakpoint
CREATE INDEX "check_ins_branch_idx" ON "check_ins" USING btree ("branch_id","checked_in_at");--> statement-breakpoint
CREATE INDEX "check_ins_appt_client_idx" ON "check_ins" USING btree ("appointment_client_id");--> statement-breakpoint
CREATE INDEX "check_ins_checked_in_at_idx" ON "check_ins" USING btree ("checked_in_at");--> statement-breakpoint
CREATE INDEX "member_sessions_admin_idx" ON "member_sessions" USING btree ("admin_member_id");--> statement-breakpoint
CREATE INDEX "member_sessions_active_idx" ON "member_sessions" USING btree ("ended_at") WHERE "member_sessions"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "refunds_number_idx" ON "refunds" USING btree ("refund_number");--> statement-breakpoint
CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "refunds_sales_order_idx" ON "refunds" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_package_instance_idx" ON "refunds" USING btree ("package_instance_id");--> statement-breakpoint
CREATE INDEX "refunds_branch_idx" ON "refunds" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "refunds_customer_idx" ON "refunds" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "refunds_requested_at_idx" ON "refunds" USING btree ("requested_at");--> statement-breakpoint
ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commission_splits_status_idx" ON "commission_splits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commission_splits_payout_idx" ON "commission_splits" USING btree ("payout_id");--> statement-breakpoint
CREATE INDEX "commission_splits_sales_order_idx" ON "commission_splits" USING btree ("sales_order_id");