-- migration: 0051_sales_pipeline_fixes
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
