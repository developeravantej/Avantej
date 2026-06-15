# Schema Drift Audit
**Session:** zplan/05-17_21-30_installment-residual-fixes/
**Findings:** 6 (0 critical · 6 high · 0 medium · 0 low · 0 info)

## Findings

### [HIGH] Missing `installments_waived` column in package_instances table
**Plan claims:** Migration 0066 adds `installments_waived integer NOT NULL DEFAULT 0` column to `package_instances` table.
**Actual:** Column does not exist in `packages/db/src/schema/tenant/package-instances.ts`. Schema shows columns up to `allowCreditOverdraft` (line 97), but no `installments_waived` column is present.
**File:** packages/db/src/schema/tenant/package-instances.ts:1-116
**Fix:** Add `installmentsWaived: integer("installments_waived").default(0).notNull()` to packageInstances table definition.

---

### [HIGH] `installments.status` enum incomplete in schema documentation
**Plan claims:** Migration 0067 adds new `"cancelled"` value to `installments.status` enum, joining existing `"pending"`, `"paid"`, `"overdue"`.
**Actual:** Schema only documents `'pending' | 'paid' | 'overdue'` (line 15), no `'cancelled'` value listed. Migration does not exist yet.
**File:** packages/db/src/schema/tenant/installments.ts:15
**Fix:** Update comment to `'pending' | 'paid' | 'overdue' | 'cancelled'` after migration is created.

---

### [HIGH] `paymentStatus` enum incomplete in package_instances schema
**Plan claims:** `package_instances.paymentStatus` gains value `"partially_paid"`.
**Actual:** Schema documents only `"pending" | "paid" | "failed" | "refunded"` (line 40), no `"partially_paid"` value listed.
**File:** packages/db/src/schema/tenant/package-instances.ts:40
**Fix:** Update comment to `"pending" | "paid" | "partially_paid" | "failed" | "refunded"` after migration is created.

---

### [HIGH] Missing composite index `idx_installments_pkg_status_due` in Drizzle schema
**Plan claims:** Index `idx_installments_pkg_status_due` on `installments(package_instance_id, status, due_date)` must be added to Drizzle schema file, not just migration SQL.
**Actual:** Index definition exists in migrations plan but NOT in `packages/db/src/schema/tenant/installments.ts`. Current indexes (lines 24-29) only include single-column and one composite unique index; the planned composite index is absent.
**File:** packages/db/src/schema/tenant/installments.ts:24-29
**Fix:** Add `index("idx_installments_pkg_status_due").on(table.packageInstanceId, table.status, table.dueDate)` to the index definitions array.

---

### [HIGH] Migration sequence conflict risk — migration 0067 exists with different purpose
**Plan claims:** New migration `0067_payment_method_unification.sql` will be created to unify payment_method values.
**Actual:** Latest existing migration is `0066_commission_condition_between_check.sql` (dated 2026-05-17 21:26). No 0067-0068 migrations exist yet. However, the plan should be verified to not conflict with any migrations added after 2026-05-17 21:26.
**File:** packages/db/src/migrations/tenant/ (checked through 0066)
**Fix:** Verify no intervening migrations were added. If no conflicts, proceed with 0067 and 0068 as planned.

---

### [HIGH] `invoices.paymentMode` vs `payments.paymentMethod` naming inconsistency
**Plan claims:** Migration 0067 updates both `invoices.payment_mode` and `payments.payment_method` columns in a unification.
**Actual:** Schema confirms column names differ: `invoices.paymentMode` (schema line 16) is stored as `payment_mode` in DB, while `payments.paymentMethod` (schema line 62) is stored as `payment_method`. This intentional naming difference (mode vs method) is preserved in both Drizzle definitions and DB columns.
**File:** packages/db/src/schema/tenant/invoices.ts:16 and packages/db/src/schema/tenant/payments.ts:62
**Fix:** Migration SQL must update BOTH columns separately: `UPDATE invoices SET payment_mode = ... WHERE payment_mode = ...` AND `UPDATE payments SET payment_method = ... WHERE payment_method = ...` (already shown in plan SQL). Ensure both column updates succeed independently.

---

## Summary
The plan references six schema changes not yet reflected in the Drizzle ORM schema files: missing `installments_waived` column, incomplete status enums for `installments` and `paymentStatus`, and missing composite index definition in the Drizzle schema (though migration SQL is planned). The migration sequence is clear (0066 exists, 0067-0068 are next), and payment method column naming inconsistency is intentional but requires coordinated updates. All findings require schema file updates to sync Drizzle definitions with planned migrations.
