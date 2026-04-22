-- Phase 1: Service Category Commission System
-- Hand-edited: truncate commission history for clean-slate migration (confirmed by user)
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
