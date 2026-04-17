CREATE TABLE "installment_plans" (
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
ALTER TABLE "package_instances" drop column "credits_remaining";--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "credits_remaining" integer GENERATED ALWAYS AS (COALESCE(credits_unlocked, credits_total) - credits_used) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "grace_period_days" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "installment_plans_code_idx" ON "installment_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "installment_plans_active_idx" ON "installment_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "installment_plans_default_idx" ON "installment_plans" USING btree ("is_default");