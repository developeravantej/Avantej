-- 0097_money_currency (WS1 — multi-currency correctness)
--
-- Adds a currency dimension so multi-country tenants (e.g. MY/TH/SG) get
-- correct per-currency money instead of co-mingled MYR-assumed totals.
--
-- branch_details.currency is the SOURCE OF TRUTH, seeded here from the branch's
-- country node name. commission_splits.currency and service_prices.currency are
-- new columns stamped from the branch at write time; they are left NULLABLE in
-- this migration. Backfill of historical transactional rows + NOT NULL
-- enforcement is a deliberate follow-up (once the country->currency mapping is
-- validated on a live tenant), so this migration never rewrites money rows.
--
-- Deliberately NOT touched here: payments.currency / payouts.currency (default
-- 'usd'). Those may be real Stripe charge currencies; correcting them requires
-- domain confirmation and is out of scope for this migration.
--
-- Idempotent — safe to re-run on a partially-migrated tenant branch.

ALTER TABLE "branch_details"    ADD COLUMN IF NOT EXISTS "currency" text;
ALTER TABLE "commission_splits" ADD COLUMN IF NOT EXISTS "currency" text;
ALTER TABLE "service_prices"    ADD COLUMN IF NOT EXISTS "currency" text;

-- Seed branch_details.currency from the branch's country node name.
-- (branch_details is config, not transactional money — safe to backfill.)
-- Only fills rows still NULL, so re-runs never clobber a set value.
UPDATE "branch_details" AS bd
SET "currency" = CASE lower(trim(cn."name"))
		WHEN 'malaysia'    THEN 'MYR'
		WHEN 'thailand'    THEN 'THB'
		WHEN 'singapore'   THEN 'SGD'
		WHEN 'indonesia'   THEN 'IDR'
		WHEN 'philippines' THEN 'PHP'
		WHEN 'vietnam'     THEN 'VND'
		ELSE 'MYR'
	END
FROM "hierarchy_nodes" AS bn
JOIN "hierarchy_nodes" AS cn ON cn."id" = bn."country_node_id"
WHERE bd."node_id" = bn."id"
	AND bd."currency" IS NULL;

-- Backfill commission_splits.currency (NEW column — never had a value, so this
-- annotates rather than rewrites money). Derive the split's branch from its
-- source: appointment.branch_id, sales_order.branch_id, or
-- package_instance -> sales_order.branch_id. Then branch -> country -> currency.
UPDATE "commission_splits" AS cs
SET "currency" = CASE lower(trim(cn."name"))
		WHEN 'malaysia'    THEN 'MYR'
		WHEN 'thailand'    THEN 'THB'
		WHEN 'singapore'   THEN 'SGD'
		WHEN 'indonesia'   THEN 'IDR'
		WHEN 'philippines' THEN 'PHP'
		WHEN 'vietnam'     THEN 'VND'
		ELSE 'MYR'
	END
FROM (
	SELECT s."id" AS split_id,
		COALESCE(a."branch_id", so."branch_id", so2."branch_id") AS branch_id
	FROM "commission_splits" s
	LEFT JOIN "appointments"      a   ON a."id"   = s."appointment_id"
	LEFT JOIN "sales_orders"      so  ON so."id"  = s."sales_order_id"
	LEFT JOIN "package_instances" pi  ON pi."id"  = s."package_instance_id"
	LEFT JOIN "sales_orders"      so2 ON so2."id" = pi."sales_order_id"
) AS src
JOIN "hierarchy_nodes" AS bn ON bn."id" = src."branch_id"
JOIN "hierarchy_nodes" AS cn ON cn."id" = bn."country_node_id"
WHERE cs."id" = src."split_id"
	AND cs."currency" IS NULL
	AND src."branch_id" IS NOT NULL;

-- Backfill service_prices.currency (NEW column). Branch-scoped rows from the
-- branch's country; org-wide (NULL branch_id) rows fall back to the default.
UPDATE "service_prices" AS sp
SET "currency" = CASE lower(trim(cn."name"))
		WHEN 'malaysia'    THEN 'MYR'
		WHEN 'thailand'    THEN 'THB'
		WHEN 'singapore'   THEN 'SGD'
		WHEN 'indonesia'   THEN 'IDR'
		WHEN 'philippines' THEN 'PHP'
		WHEN 'vietnam'     THEN 'VND'
		ELSE 'MYR'
	END
FROM "hierarchy_nodes" AS bn
JOIN "hierarchy_nodes" AS cn ON cn."id" = bn."country_node_id"
WHERE sp."branch_id" = bn."id"
	AND sp."currency" IS NULL;

UPDATE "service_prices"
SET "currency" = 'MYR'
WHERE "currency" IS NULL
	AND "branch_id" IS NULL;
