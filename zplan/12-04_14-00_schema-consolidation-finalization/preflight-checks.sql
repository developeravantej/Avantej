-- =============================================================================
-- preflight-checks.sql
--
-- Stand-alone, READ-ONLY dry-run for the schema consolidation migration.
-- Running this file makes ZERO changes to the database. It runs every check
-- from Section 2 of 0010_schema_consolidation.sql and reports what the real
-- migration would find.
--
-- Usage:
--   TENANT_DB_URL=$(neon connection-string --project-id <id> --branch main)
--   psql "$TENANT_DB_URL" -f zplan/12-04_14-00_schema-consolidation-finalization/preflight-checks.sql
--
-- Every query is a SELECT. Nothing is inserted, updated, or dropped. Safe to
-- run any time — even in production — without affecting state.
--
-- Expected results (all clean):
--   unmapped_packages                : 0
--   ambiguous_package_matches        : 0 rows
--   orphan_package_instances         : 0
--   orphan_cancelled_sales           : 0
--   duplicate_cancellation_numbers   : 0 rows
--   legacy_appointment_client_refs   : <informational only — will be NULLed>
--   pre_backfill_counts              : baseline row counts for later comparison
--
-- Any non-zero result (except the informational ones) means the real migration
-- would abort. Fix the underlying data, then re-run this file until clean.
-- =============================================================================

\echo ''
\echo '========================================================================'
\echo 'PRE-FLIGHT CHECK: Schema Consolidation Migration'
\echo 'Read-only dry run. No changes will be made.'
\echo '========================================================================'
\echo ''

-- -----------------------------------------------------------------------------
-- Check 1: Packages that have no matching service (by name + branch_id)
-- These would cause the migration to ABORT at Section 2a.
-- -----------------------------------------------------------------------------
\echo '--- Check 1: Unmapped packages ---'
\echo 'Expected: zero rows. Any row here = the migration will abort.'
\echo ''

SELECT p.id, p.name, p.branch_id, p.session_count, p.appointment_type
FROM packages p
WHERE NOT EXISTS (
  SELECT 1 FROM services s
  WHERE s.name = p.name
    AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
);

\echo ''

-- -----------------------------------------------------------------------------
-- Check 2: Packages that match MORE THAN ONE service
-- These would cause the migration to ABORT at Section 2b.
-- (Usually means duplicate services with the same name+branch — a data bug.)
-- -----------------------------------------------------------------------------
\echo '--- Check 2: Ambiguous package→service matches ---'
\echo 'Expected: zero rows.'
\echo ''

SELECT p.id AS package_id, p.name, p.branch_id, COUNT(s.id) AS matching_services
FROM packages p
JOIN services s
  ON s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
GROUP BY p.id, p.name, p.branch_id
HAVING COUNT(s.id) > 1;

\echo ''

-- -----------------------------------------------------------------------------
-- Check 3: Package instances whose package_id points at a nonexistent package
-- These would cause the migration to ABORT at Section 2c.
-- -----------------------------------------------------------------------------
\echo '--- Check 3: Orphan package_instances ---'
\echo 'Expected: zero rows.'
\echo ''

SELECT pi.id AS instance_id, pi.client_id, pi.package_id, pi.status
FROM package_instances pi
WHERE pi.package_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = pi.package_id);

\echo ''

-- -----------------------------------------------------------------------------
-- Check 4: Cancelled sales whose sales_order_id points at nothing
-- These would cause the migration to ABORT at Section 2d.
-- -----------------------------------------------------------------------------
\echo '--- Check 4: Orphan cancelled_sales ---'
\echo 'Expected: zero rows.'
\echo ''

SELECT cs.id, cs.cancellation_number, cs.sales_order_id, cs.cancellation_date
FROM cancelled_sales cs
WHERE NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = cs.sales_order_id);

\echo ''

-- -----------------------------------------------------------------------------
-- Check 5: Duplicate cancellation numbers
-- These would cause the migration to ABORT at Section 2e (unique constraint).
-- -----------------------------------------------------------------------------
\echo '--- Check 5: Duplicate cancellation_numbers ---'
\echo 'Expected: zero rows.'
\echo ''

SELECT cancellation_number, COUNT(*) AS dup_count
FROM cancelled_sales
GROUP BY cancellation_number
HAVING COUNT(*) > 1;

\echo ''

-- -----------------------------------------------------------------------------
-- Check 6: INFORMATIONAL — appointment_clients with non-null package_assignment_id
-- These will be NULLed by Section 5.5 of the real migration.
-- This is NOT a blocker. Just a count of rows that will lose their legacy pointer.
-- -----------------------------------------------------------------------------
\echo '--- Check 6 (informational): appointment_clients that will have package_assignment_id NULLed ---'
\echo 'This is NOT a blocker. It just shows how many rows lose their legacy pointer.'
\echo ''

SELECT COUNT(*) AS legacy_refs_that_will_be_nulled
FROM appointment_clients
WHERE package_assignment_id IS NOT NULL;

\echo ''

-- -----------------------------------------------------------------------------
-- Check 7: INFORMATIONAL — Services that will have their "type" clobbered
-- by the Section 3b heuristic backfill (type = 'private' + matching package).
-- -----------------------------------------------------------------------------
\echo '--- Check 7 (informational): Services whose type will be overwritten by heuristic ---'
\echo 'This shows the rows where the migration will trust the package value over the service default.'
\echo ''

SELECT s.id, s.name, s.branch_id, s.type AS current_type, p.appointment_type AS new_type
FROM services s
JOIN packages p
  ON s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
WHERE s.type = 'private'
  AND p.appointment_type IN ('semi_private', 'both');

\echo ''

-- -----------------------------------------------------------------------------
-- Check 8: INFORMATIONAL — Services that will have their price populated
-- from the matching package (service's price IS NULL).
-- -----------------------------------------------------------------------------
\echo '--- Check 8 (informational): Services whose price will be populated from package ---'
\echo ''

SELECT s.id, s.name, s.branch_id, p.price_per_session AS incoming_price
FROM services s
JOIN packages p
  ON s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
WHERE s.price IS NULL
  AND p.price_per_session IS NOT NULL;

\echo ''

-- -----------------------------------------------------------------------------
-- Check 9: Baseline row counts (reference for post-migration comparison)
-- -----------------------------------------------------------------------------
\echo '--- Check 9: Baseline row counts (save this output!) ---'
\echo 'Compare against post-migration counts in Phase 2 Task 2.5.'
\echo ''

SELECT 'packages'                    AS table_name, COUNT(*) AS row_count FROM packages
UNION ALL SELECT 'package_assignments',          COUNT(*) FROM package_assignments
UNION ALL SELECT 'cancelled_sales',                COUNT(*) FROM cancelled_sales
UNION ALL SELECT 'service_rules',                  COUNT(*) FROM service_rules
UNION ALL SELECT 'service_commission_config',      COUNT(*) FROM service_commission_config
UNION ALL SELECT 'services',                       COUNT(*) FROM services
UNION ALL SELECT 'services_with_session_count',    COUNT(*) FROM services WHERE session_count IS NOT NULL
UNION ALL SELECT 'sales_orders',                   COUNT(*) FROM sales_orders
UNION ALL SELECT 'sales_orders_cancelled',         COUNT(*) FROM sales_orders WHERE status = 'cancelled'
UNION ALL SELECT 'package_instances',              COUNT(*) FROM package_instances
UNION ALL SELECT 'appointment_clients',            COUNT(*) FROM appointment_clients
UNION ALL SELECT 'appointment_clients_with_pkg',   COUNT(*) FROM appointment_clients WHERE package_assignment_id IS NOT NULL
ORDER BY table_name;

\echo ''
\echo '========================================================================'
\echo 'PRE-FLIGHT COMPLETE'
\echo ''
\echo 'If checks 1-5 returned zero rows, the real migration will succeed.'
\echo 'Checks 6-8 are informational — review but no action required.'
\echo 'Check 9 is your baseline — save the output for post-migration comparison.'
\echo '========================================================================'
