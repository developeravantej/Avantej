-- migration: 0032_add_branch_pricing
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
