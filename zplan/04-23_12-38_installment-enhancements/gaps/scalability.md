# Scalability Audit
**Session:** zplan/04-23_12-38_installment-enhancements
**Findings:** 4 (0 critical · 1 high · 2 medium · 1 low)

## Findings

### [HIGH] Unbounded in-memory count in `getAdminInstallmentOverview`
**Plan claims:** "pagination limit of 50/200 rows; no unbounded operations." ✅
**Actual:** After the paginated fetch (which correctly uses `limit`/`offset`), lines ~943–947 execute a second query with `columns: { id: true }` and no `LIMIT`, fetching ALL matching rows just to call `.length` on them. At 10k matching packages, this is a full sequential scan on every page open.
**File:** `packages/services/src/installment.service.ts:943–947`
**Fix:** Replace the full-fetch count with `SELECT COUNT(*) FROM package_instances WHERE <same conditions>`. Drizzle: `await tx.select({ count: sql<number>`count(*)` }).from(packageInstances).where(and(...conditions))`. This is a pre-existing issue that the new `due_soon` filter will make worse (more filter conditions, same O(N) scan).

---

### [MEDIUM] Task 1.5 batch query — composite index missing on `installments`
**Plan claims:** Batch query: `WHERE package_instance_id IN (...) AND status IN ('pending','overdue') ORDER BY installment_number ASC`. Plan says "check if indexed before merging".
**Actual:** `installments.ts` has an index on `package_instance_id` alone (line 22), and a unique constraint on `(packageInstanceId, installmentNumber)` (line 25). There is no composite index covering `(package_instance_id, status, installment_number)`. For each package, the DB will scan all installments by `package_instance_id` and then filter by status in-engine — acceptable at low row counts, but each additional installment per package increases the scan cost.
**File:** `packages/db/src/schema/tenant/installments.ts:22,25`
**Fix:** Add a composite index: `index("installments_pkg_status_num_idx").on(installments.packageInstanceId, installments.status, installments.installmentNumber)` in the schema file. Include in the same migration as `allow_credit_overdraft` or a follow-on migration.

---

### [MEDIUM] `gracePeriodEndsAt IS NULL` predicate lacks a supporting index
**Plan claims:** Plan acknowledges this and defers to profiling.
**Actual:** The `due_soon` filter combines `isLocked = false`, `gracePeriodEndsAt IS NULL`, `nextDueDate BETWEEN now AND now+14d`. PostgreSQL can use the `next_due_date` index for the range predicate but must apply `is_locked = false` and `grace_period_ends_at IS NULL` as filter-after-index-scan. If the next_due_date range is wide (e.g. many packages due in 14d), the filter cost grows. Plan's suggested partial index is the right call.
**File:** `packages/db/src/schema/tenant/package-instances.ts:87–88`
**Fix:** After Phase 1 deployment, run `EXPLAIN ANALYZE` on the due_soon query. If sequential scan appears, add:
```sql
CREATE INDEX package_instances_due_soon_idx ON package_instances (next_due_date)
  WHERE is_locked = false AND grace_period_ends_at IS NULL;
```
(Or Drizzle equivalent with `.where(...)` option.) Defer unless profiling confirms the issue.

---

### [LOW] `setPackageOverdraft` not yet implemented — design is sound
**Plan claims:** Single-row lock via `.for("update")` by PK, two inserts (event + audit) inside one transaction. Matches `unlockPackage` pattern.
**Actual:** Function does not exist yet. Proposed design in §3 is correct: no loops, no external calls inside the transaction, single-row lock scope. `writeAudit` is a pure DB insert (not an HTTP call), so calling it inside `tenantDb.transaction` is safe.
**File:** `packages/services/src/installment.service.ts` (Phase 4 addition)
**Fix:** No scalability concern. Note: pass the transaction handle `tx` (not `tenantDb`) to `writeAudit` — the plan code in §3 shows `writeAudit(tx, ...)` which is correct.

---

## Summary

The plan's own scalability checklist is thorough and mostly accurate. The one pre-existing issue it would worsen is the unbounded count query in `getAdminInstallmentOverview` — a second full-table scan executed on every page load. This should be fixed as part of Phase 1 since adding the `due_soon` filter path will be tested against it. The missing composite index on `installments(package_instance_id, status, installment_number)` is a genuine optimization gap for Task 1.5 that should be added proactively rather than waiting for profiling. The partial index on `package_instances` for the `due_soon` predicate is correctly deferred to post-deploy profiling. The `setPackageOverdraft` transaction design is sound by inspection.
