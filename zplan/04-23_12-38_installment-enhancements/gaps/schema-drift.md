# Schema Drift Audit
**Session:** zplan/04-23_12-38_installment-enhancements
**Findings:** 7 (0 critical · 2 high · 1 medium · 0 low · 4 info)

## Findings

### [HIGH] Migration runner incomplete — migrations 0016-0029 constants not in TENANT_MIGRATIONS array
**Plan claims:** Next migration should be `0016_<name>.sql`; per project memory latest embedded is `0007_short_korath`.
**Actual:** `migrate-tenant.ts` has constants defined through `MIGRATION_0029_SERVICE_CATEGORY_COMMISSION`, but the `TENANT_MIGRATIONS` array ends with `0015_abnormal_absorbing_man`. Migrations 0016–0029 are defined as constants but NOT pushed into the runtime array. The migration runner will not apply them.
**File:** `packages/db/src/migrate-tenant.ts:2237–2358`
**Fix:** Append all missing migration constants (0016–0029) to the `TENANT_MIGRATIONS` array in order, then add the new 0016 migration for `allow_credit_overdraft`.

---

### [HIGH] Plan's claim about latest embedded migration is stale
**Plan claims:** Project memory says latest embedded migration is `0007_short_korath.sql` / `MIGRATION_0007_SHORT_KORATH`.
**Actual:** The TENANT_MIGRATIONS array ends with `0015_abnormal_absorbing_man` (line ~2355). Project memory is significantly out of date.
**File:** `packages/db/src/migrate-tenant.ts:2355`
**Fix:** Update project memory to reflect actual latest. When generating the new migration, verify sequence number is correct (should be 0016 if the missing 0016–0029 constants are added, or higher if they were already applied).

---

### [MEDIUM] Two migration files share number 0014 — naming collision
**Plan claims:** Migration files are sequentially numbered.
**Actual:** Both `0014_expenses_currency_myr.sql` and `0014_lively_jane_foster.sql` exist in `packages/db/src/migrations/tenant/`, indicating a past collision. The next available integer (0016) should be verified against both the filesystem and the migrate-tenant.ts constants before generating the new migration.
**File:** `packages/db/src/migrations/tenant/`
**Fix:** Before running `db:generate:tenant`, confirm there is no existing `0016_*.sql` and that the new constant name will be unique in migrate-tenant.ts.

---

### [INFO] Column placement verified
**Plan claims:** `allowCreditOverdraft` goes between `creditsAdminOverride` (line 73) and `createdAt` (line 75).
**Actual:** Confirmed. Line 73 = `creditsAdminOverride`, line 75 = `createdAt`. Insertion point at line 74 is correct. ✓
**File:** `packages/db/src/schema/tenant/package-instances.ts:73–75`
**Fix:** None.

---

### [INFO] Index names verified
**Plan claims:** `package_instances_is_locked_idx` (line 87) and `package_instances_next_due_date_idx` (line 88) exist.
**Actual:** Both present at the cited lines. ✓
**File:** `packages/db/src/schema/tenant/package-instances.ts:87–88`
**Fix:** None.

---

### [INFO] installmentEvents.installmentId is nullable
**Plan claims:** `installmentId` is nullable — supports events with no installment.
**Actual:** Confirmed at lines 10–11 via `.references().onDelete('set null')`. ✓
**File:** `packages/db/src/schema/tenant/installment-events.ts:10–11`
**Fix:** None.

---

### [INFO] installmentEvents.eventType is text (not Postgres enum)
**Plan claims:** `eventType` is a text column; adding `overdraft_enabled`/`overdraft_disabled` requires no migration.
**Actual:** Confirmed: `eventType: text("event_type").notNull()` at line 12. ✓
**File:** `packages/db/src/schema/tenant/installment-events.ts:12`
**Fix:** None.

---

## Summary

The tenant schema entities the plan touches (packageInstances, installmentEvents, installments, audit_logs) all exist and are correctly structured. Column insertion point, index names, and nullable assumptions are accurate. The critical infrastructure risk is that `migrate-tenant.ts` has 14 migration constants (0016–0029) that are defined but not in the TENANT_MIGRATIONS runtime array — the new 0016 migration must be added after resolving this backlog, and the project memory reference to "0007_short_korath as latest" must be treated as stale.
