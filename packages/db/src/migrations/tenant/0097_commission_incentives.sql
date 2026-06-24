-- 0097_commission_incentives (UAT §12 — incentive thresholds)
-- Rules table + idempotent award ledger. The UNIQUE(incentive_id, staff_id,
-- period_key) on the awards table makes the period sweep exactly-once: a re-run
-- inserts ON CONFLICT DO NOTHING and never double-pays a bonus.
-- Idempotent — safe to re-run on partially migrated tenant branches.

CREATE TABLE IF NOT EXISTS "commission_incentives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role_type" text NOT NULL DEFAULT 'sales',
	"trainer_tier_id" uuid,
	"period_type" text NOT NULL DEFAULT 'monthly',
	"threshold_cents" integer NOT NULL,
	"bonus_type" text NOT NULL DEFAULT 'fixed',
	"bonus_value" integer NOT NULL,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "commission_incentives"
		ADD CONSTRAINT "commission_incentives_trainer_tier_id_trainer_tiers_id_fk"
		FOREIGN KEY ("trainer_tier_id") REFERENCES "trainer_tiers"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "commission_incentives_active_idx" ON "commission_incentives" ("is_active");
CREATE INDEX IF NOT EXISTS "commission_incentives_role_idx" ON "commission_incentives" ("role_type");

CREATE TABLE IF NOT EXISTS "commission_incentive_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incentive_id" uuid NOT NULL,
	"staff_id" text NOT NULL,
	"period_key" text NOT NULL,
	"qualifying_total_cents" integer NOT NULL,
	"threshold_cents" integer NOT NULL,
	"bonus_cents" integer NOT NULL,
	"awarded_at" timestamptz DEFAULT now() NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "commission_incentive_awards"
		ADD CONSTRAINT "commission_incentive_awards_incentive_id_commission_incentives_id_fk"
		FOREIGN KEY ("incentive_id") REFERENCES "commission_incentives"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "commission_incentive_awards_unique"
	ON "commission_incentive_awards" ("incentive_id", "staff_id", "period_key");
CREATE INDEX IF NOT EXISTS "commission_incentive_awards_staff_idx" ON "commission_incentive_awards" ("staff_id");
CREATE INDEX IF NOT EXISTS "commission_incentive_awards_period_idx" ON "commission_incentive_awards" ("period_key");
