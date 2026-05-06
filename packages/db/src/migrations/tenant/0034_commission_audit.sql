-- migration: 0034_commission_audit
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
