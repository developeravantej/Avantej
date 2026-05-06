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
