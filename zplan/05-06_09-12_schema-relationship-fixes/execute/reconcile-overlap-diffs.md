# Overlap diffs


## 0008_schema_consolidation

### Embedded (7783 chars)

```sql

ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "session_count" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "expirable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "expiry_days" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "expiry_date" timestamp;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_number" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_date" timestamp;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancelled_amount" integer;--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN IF NOT EXISTS "service_id" uuid;--> statement-breakpoint
DO $$
DECLARE
  unmapped_count integer;
BEGIN
  SELECT COUNT(*) INTO unmapped_count
  FROM packages p
  WHERE NOT EXISTS (
    SELECT 1 FROM services s
    WHERE s.name = p.name
      AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  );
  IF unmapped_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package(s) have no matching service (match by name + branch_id). Resolve manually before re-running.', unmapped_count;
  END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE
  ambiguous_count integer;
BEGIN
  SELECT COUNT(*) INTO ambiguous_count FROM (
    SELECT p.id
    FROM packages p
    JOIN services s ON s.name = p.name AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
    GROUP BY p.id
    HAVING COUNT(s.id) > 1
  ) ambiguous;
  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package(s) have ambiguous service matches. Services with duplicate (name, branch_id) must be deduplicated first.', ambiguous_count;
  END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM package_instances pi
  WHERE pi.package_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = pi.package_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package_instances row(s) reference non-existent packages. Delete orphans before re-running.', orphan_count;
  END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM cancelled_sales cs
  WHERE NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = cs.sales_order_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % cancelled_sales row(s) reference non-existent sales orders.', orphan_count;
  END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT cancellation_number FROM cancelled_sales
    GROUP BY cancellation_number HAVING COUNT(*) > 1
  ) dups;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % duplicate cancellation_number(s) in cancelled_sales.', dup_count;
  END IF;
END $$;--> statement-breakpoint
UPDATE services s
SET session_count = p.session_count,
    expirable     = (p.expiry_days IS NOT NULL OR p.expiry_date IS NOT NULL),
    expiry_days   = p.expiry_days,
    expiry_date   = p.expiry_date,
    updated_at    = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.session_count IS NULL;--> statement-breakpoint
UPDATE services s
SET type = p.appointment_type,
    updated_at = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.type = 'private'
  AND p.appointment_type IN ('private', 'semi_private', 'both');--> statement-breakpoint
UPDATE services s
SET price = p.price_per_session,
    updated_at = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.price IS NULL
  AND p.price_per_session IS NOT NULL;--> statement-breakpoint
UPDATE package_instances pi
SET service_id = s.id,
    updated_at = now()
FROM packages p
JOIN services s
  ON s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
WHERE pi.package_id = p.id
  AND pi.service_id IS NULL;--> statement-breakpoint
UPDATE sales_orders so
SET cancellation_number = cs.cancellation_number,
    cancellation_date   = cs.cancellation_date,
    cancellation_reason = cs.cancellation_reason,
    cancelled_by        = cs.cancelled_by,
    cancelled_amount    = cs.cancelled_amount,
    updated_at          = now()
FROM cancelled_sales cs
WHERE so.id = cs.sales_order_id
  AND so.cancellation_number IS NULL;--> statement-breakpoint
DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM package_instances WHERE service_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill check failed: % package_instances row(s) still have NULL service_id.', null_count;
  END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM sales_orders
  WHERE status = 'cancelled' AND cancellation_number IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Backfill check failed: % cancelled sales_orders have no cancellation_number.', missing_count;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "package_instances" ALTER COLUMN "service_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "package_instances"
  ADD CONSTRAINT "package_instances_service_id_services_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_cancellation_number_unique" UNIQUE ("cancellation_number");--> statement-breakpoint
DROP INDEX IF EXISTS "appointment_clients_package_idx";--> statement-breakpoint
ALTER TABLE "appointment_clients"
  DROP CONSTRAINT IF EXISTS "appointment_clients_package_assignment_id_package_assignments_id_fk";--> statement-breakpoint
ALTER TABLE "appointment_clients" RENAME COLUMN "package_assignment_id" TO "package_instance_id";--> statement-breakpoint
UPDATE appointment_clients SET package_instance_id = NULL;--> statement-breakpoint
ALTER TABLE "appointment_clients"
  ADD CONSTRAINT "appointment_clients_package_instance_id_package_instances_id_fk"
  FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_instances" DROP COLUMN IF EXISTS "package_id";--> statement-breakpoint
DROP TABLE IF EXISTS "cancelled_sales" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "package_assignments" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "packages" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "service_commission_config" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "service_rules" CASCADE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "services_expiry_days_idx" ON "services" USING btree ("expiry_days");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_cancellation_number_idx" ON "sales_orders" USING btree ("cancellation_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_cancellation_date_idx" ON "sales_orders" USING btree ("cancellation_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "package_instances_service_idx" ON "package_instances" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointment_clients_package_instance_idx" ON "appointment_clients" USING btree ("package_instance_id");

```

### File (12114 chars)

```sql
-- 0010_schema_consolidation.sql
-- Schema consolidation for Customer-app branch.
-- Drops 5 redundant tables and absorbs their data into services, sales_orders, package_instances.
-- Also renames appointment_clients.package_assignment_id -> package_instance_id (Finding 3 / Option A).
-- Adds sales_orders.cancelled_amount to persist partial refund data (Finding 1).
--
-- This file is idempotent across partial application via IF NOT EXISTS / IF EXISTS guards
-- and WHERE-clause checks on backfill UPDATEs. It runs as one atomic transaction — if any
-- statement fails, everything rolls back.
--
-- See zplan/12-04_14-00_schema-consolidation-finalization/01-phase1-write-migration-sql.md
-- for the full design rationale.

-- ============================================================================
-- SECTION 1: ADD NEW COLUMNS (nullable, no constraints yet)
-- ============================================================================

-- services gets the package-equivalent fields
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "session_count" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "expirable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "expiry_days" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "expiry_date" timestamp;--> statement-breakpoint

-- sales_orders gets cancellation metadata (previously in its own table)
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_number" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_date" timestamp;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "cancelled_amount" integer;--> statement-breakpoint

-- package_instances gets service_id (will replace package_id)
-- Nullable at first — we'll enforce NOT NULL after backfill.
ALTER TABLE "package_instances" ADD COLUMN IF NOT EXISTS "service_id" uuid;--> statement-breakpoint

-- ============================================================================
-- SECTION 2: PRE-FLIGHT CHECKS (abort if preconditions are not met)
-- ============================================================================

-- 2a. Every package must map to exactly one service by (name, branch_id)
DO $$
DECLARE
  unmapped_count integer;
BEGIN
  SELECT COUNT(*) INTO unmapped_count
  FROM packages p
  WHERE NOT EXISTS (
    SELECT 1 FROM services s
    WHERE s.name = p.name
      AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  );
  IF unmapped_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package(s) have no matching service (match by name + branch_id). Resolve manually before re-running.', unmapped_count;
  END IF;
END $$;--> statement-breakpoint

-- 2b. Every package name+branch must match exactly ONE service (not ambiguous)
DO $$
DECLARE
  ambiguous_count integer;
BEGIN
  SELECT COUNT(*) INTO ambiguous_count FROM (
    SELECT p.id
    FROM packages p
    JOIN services s ON s.name = p.name AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
    GROUP BY p.id
    HAVING COUNT(s.id) > 1
  ) ambiguous;
  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package(s) have ambiguous service matches. Services with duplicate (name, branch_id) must be deduplicated first.', ambiguous_count;
  END IF;
END $$;--> statement-breakpoint

-- 2c. Every package_instances.package_id must resolve to a known package
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM package_instances pi
  WHERE pi.package_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = pi.package_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package_instances row(s) reference non-existent packages. Delete orphans before re-running.', orphan_count;
  END IF;
END $$;--> statement-breakpoint

-- 2d. Every cancelled_sales.sales_order_id must resolve to a known sales order
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM cancelled_sales cs
  WHERE NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = cs.sales_order_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % cancelled_sales row(s) reference non-existent sales orders.', orphan_count;
  END IF;
END $$;--> statement-breakpoint

-- 2e. No duplicate cancellation_number values in the source
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT cancellation_number FROM cancelled_sales
    GROUP BY cancellation_number HAVING COUNT(*) > 1
  ) dups;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % duplicate cancellation_number(s) in cancelled_sales.', dup_count;
  END IF;
END $$;--> statement-breakpoint

-- ============================================================================
-- SECTION 3: BACKFILL NEW COLUMNS FROM LEGACY TABLES
-- ============================================================================

-- 3a. services: copy session_count, expirable, expiry_days, expiry_date from matching packages
UPDATE services s
SET session_count = p.session_count,
    expirable     = (p.expiry_days IS NOT NULL OR p.expiry_date IS NOT NULL),
    expiry_days   = p.expiry_days,
    expiry_date   = p.expiry_date,
    updated_at    = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.session_count IS NULL;--> statement-breakpoint

-- 3b. services: heuristic backfill of type and price.
--     Only overrides defaults/nulls — never clobbers explicit values.
UPDATE services s
SET type = p.appointment_type,
    updated_at = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.type = 'private'
  AND p.appointment_type IN ('private', 'semi_private', 'both');--> statement-breakpoint

UPDATE services s
SET price = p.price_per_session,
    updated_at = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.price IS NULL
  AND p.price_per_session IS NOT NULL;--> statement-breakpoint

-- 3c. package_instances: backfill service_id via the packages->services mapping
UPDATE package_instances pi
SET service_id = s.id,
    updated_at = now()
FROM packages p
JOIN services s
  ON s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
WHERE pi.package_id = p.id
  AND pi.service_id IS NULL;--> statement-breakpoint

-- 3d. sales_orders: copy cancellation metadata from cancelled_sales.
--     cancelled_amount comes from cancelled_sales.cancelled_amount — the whole point
--     of the partial-refund persistence fix.
UPDATE sales_orders so
SET cancellation_number = cs.cancellation_number,
    cancellation_date   = cs.cancellation_date,
    cancellation_reason = cs.cancellation_reason,
    cancelled_by        = cs.cancelled_by,
    cancelled_amount    = cs.cancelled_amount,
    updated_at          = now()
FROM cancelled_sales cs
WHERE so.id = cs.sales_order_id
  AND so.cancellation_number IS NULL;--> statement-breakpoint

-- ============================================================================
-- SECTION 4: POST-BACKFILL CHECKS
-- ============================================================================

-- 4a. Every package_instance should now have a service_id
DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM package_instances WHERE service_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill check failed: % package_instances row(s) still have NULL service_id.', null_count;
  END IF;
END $$;--> statement-breakpoint

-- 4b. Every cancelled sales_order should have a cancellation_number
DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM sales_orders
  WHERE status = 'cancelled' AND cancellation_number IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Backfill check failed: % cancelled sales_orders have no cancellation_number.', missing_count;
  END IF;
END $$;--> statement-breakpoint

-- ============================================================================
-- SECTION 5: ENFORCE NEW CONSTRAINTS
-- ============================================================================

ALTER TABLE "package_instances" ALTER COLUMN "service_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "package_instances"
  ADD CONSTRAINT "package_instances_service_id_services_id_fk"
  FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "sales_orders"
  ADD CONSTRAINT "sales_orders_cancellation_number_unique" UNIQUE ("cancellation_number");--> statement-breakpoint

-- ============================================================================
-- SECTION 5.5: RENAME appointment_clients ORPHAN COLUMN -> package_instance_id
-- ============================================================================
-- Per-client package credit tracking for group classes. The old column FK'd to
-- the dropped package_assignments table; we rename and re-point at package_instances.
-- Legacy UUID values are NULLed out — mock data only, no real history loss.

DROP INDEX IF EXISTS "appointment_clients_package_idx";--> statement-breakpoint

-- Drop the legacy FK first (the DROP TABLE package_assignments below would cascade it,
-- but being explicit keeps the statement order obvious).
ALTER TABLE "appointment_clients"
  DROP CONSTRAINT IF EXISTS "appointment_clients_package_assignment_id_package_assignments_id_fk";--> statement-breakpoint

ALTER TABLE "appointment_clients" RENAME COLUMN "package_assignment_id" TO "package_instance_id";--> statement-breakpoint
UPDATE appointment_clients SET package_instance_id = NULL;--> statement-breakpoint
ALTER TABLE "appointment_clients"
  ADD CONSTRAINT "appointment_clients_package_instance_id_package_instances_id_fk"
  FOREIGN KEY ("package_instance_id") REFERENCES "public"."package_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- ============================================================================
-- SECTION 6: DROP LEGACY COLUMNS AND TABLES
-- ============================================================================

ALTER TABLE "package_instances" DROP COLUMN IF EXISTS "package_id";--> statement-breakpoint

DROP TABLE IF EXISTS "cancelled_sales" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "package_assignments" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "packages" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "service_commission_config" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "service_rules" CASCADE;--> statement-breakpoint

-- ============================================================================
-- SECTION 7: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "services_expiry_days_idx" ON "services" USING btree ("expiry_days");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_cancellation_number_idx" ON "sales_orders" USING btree ("cancellation_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_cancellation_date_idx" ON "sales_orders" USING btree ("cancellation_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "package_instances_service_idx" ON "package_instances" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointment_clients_package_instance_idx" ON "appointment_clients" USING btree ("package_instance_id");

```


## 0009_bouncy_namorita

### Embedded (2002 chars)

```sql

CREATE TABLE IF NOT EXISTS "dashboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" uuid,
	"snapshot_date" timestamp with time zone NOT NULL,
	"period" text NOT NULL,
	"total_sales" integer DEFAULT 0 NOT NULL,
	"sales_order_count" integer DEFAULT 0 NOT NULL,
	"total_appointments" integer DEFAULT 0 NOT NULL,
	"completed_appointments" integer DEFAULT 0 NOT NULL,
	"active_members_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trainer_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "partner_stripe_accounts" DROP CONSTRAINT IF EXISTS "partner_stripe_accounts_partner_id_members_user_id_fk";--> statement-breakpoint
ALTER TABLE "trainer_availability" ADD CONSTRAINT "trainer_availability_trainer_id_members_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_snapshots_org_period_idx" ON "dashboard_snapshots" USING btree ("organization_id","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_snapshots_date_idx" ON "dashboard_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trainer_availability_trainer_id_idx" ON "trainer_availability" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trainer_availability_trainer_day_idx" ON "trainer_availability" USING btree ("trainer_id","day_of_week");

```

### File (1941 chars)

```sql
CREATE TABLE "dashboard_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"branch_id" uuid,
	"snapshot_date" timestamp with time zone NOT NULL,
	"period" text NOT NULL,
	"total_sales" integer DEFAULT 0 NOT NULL,
	"sales_order_count" integer DEFAULT 0 NOT NULL,
	"total_appointments" integer DEFAULT 0 NOT NULL,
	"completed_appointments" integer DEFAULT 0 NOT NULL,
	"active_members_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainer_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"day_of_week" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_stripe_accounts" DROP CONSTRAINT "partner_stripe_accounts_partner_id_members_user_id_fk";
--> statement-breakpoint
ALTER TABLE "trainer_availability" ADD CONSTRAINT "trainer_availability_trainer_id_members_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_snapshots_org_period_idx" ON "dashboard_snapshots" USING btree ("organization_id","period");--> statement-breakpoint
CREATE INDEX "dashboard_snapshots_date_idx" ON "dashboard_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "trainer_availability_trainer_id_idx" ON "trainer_availability" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX "trainer_availability_trainer_day_idx" ON "trainer_availability" USING btree ("trainer_id","day_of_week");
```


## 0016_worried_wolfpack

### Embedded (167 chars)

```sql

ALTER TABLE "expenses" ALTER COLUMN "currency" SET DEFAULT 'myr';
ALTER TABLE "package_instances" ADD COLUMN "allow_credit_overdraft" boolean DEFAULT false NOT NULL;

```

### File (190 chars)

```sql
ALTER TABLE "expenses" ALTER COLUMN "currency" SET DEFAULT 'myr';--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "allow_credit_overdraft" boolean DEFAULT false NOT NULL;
```


## 0021_add_tenant_migrations_metadata

### Embedded (207 chars)

```sql

ALTER TABLE "drizzle_migrations" ADD COLUMN IF NOT EXISTS "checksum" text;--> statement-breakpoint
ALTER TABLE "drizzle_migrations" ADD COLUMN IF NOT EXISTS "applied_at" timestamptz NOT NULL DEFAULT now();

```

### File (428 chars)

```sql
-- Add metadata columns to drizzle_migrations tracking table.
-- Idempotent — safe to apply on tenants that already have these columns
-- (e.g. provisioned via the embedded migrator that pre-dates the file-based loader).
ALTER TABLE "drizzle_migrations" ADD COLUMN IF NOT EXISTS "checksum" text;
--> statement-breakpoint
ALTER TABLE "drizzle_migrations" ADD COLUMN IF NOT EXISTS "applied_at" timestamptz NOT NULL DEFAULT now();

```

