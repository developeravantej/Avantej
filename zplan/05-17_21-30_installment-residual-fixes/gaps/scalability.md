# Scalability Audit
**Session:** zplan/05-17_21-30_installment-residual-fixes/
**Findings:** 10 (3 critical · 3 high · 2 medium · 1 low · 1 info)

## Findings

### [CRITICAL] Phase B — `processRefund` leaves phantom pending installments (no bulk cancel)
**Plan claims:** Phase B.1 bulk-cancels remaining installments in one `UPDATE ... WHERE status IN ('pending', 'overdue') RETURNING id` within the refund transaction.
**Actual:** `processRefund` (lines 764–804) updates only the `packageInstances` row and inserts one event. Zero `UPDATE installments` statements. Pending/overdue installments survive a refund intact — phantom debts in the overview.
**File:** `packages/services/src/installment.service.ts:764`
**Fix:** Add `UPDATE installments SET status = 'cancelled', updated_at = NOW() WHERE package_instance_id = ? AND status IN ('pending', 'overdue') RETURNING id` as first write inside the transaction, before the package status update.

---

### [CRITICAL] Phase B — `processRefund` lacks `FOR UPDATE` on packageInstances
**Plan claims:** Phase B wraps refund in a transaction (already done) and adds a FOR UPDATE lock.
**Actual:** Transaction exists but no `SELECT ... FOR UPDATE` on `packageInstances`. A concurrent `confirmInstallmentPayment` can read pre-refund state, unlock credits, then the refund commits cancelling the package — leaving a cancelled package with stale creditsUnlocked.
**File:** `packages/services/src/installment.service.ts:764`
**Fix:** Add `SELECT ... FROM packageInstances WHERE id = ? FOR UPDATE` as the first statement in the transaction (before any UPDATE).

---

### [CRITICAL] Phase E — `rescheduleInstallment` has no transaction or `FOR UPDATE` lock
**Plan claims:** Phase E.1 wraps entire function body in `tenantDb.transaction()` with `FOR UPDATE` on installment row first, then package row (matching `confirmInstallmentPayment` lock order at lines 315/326).
**Actual:** `rescheduleInstallment` (lines 818–901) is entirely unwrapped. Reads installment (line 825, no lock), reads package (line 836, no lock), then UPDATE installment (line 857), then UPDATE package (line 880). Zero `.for("update")` calls. Two concurrent reschedules of the same installment will both succeed, producing conflicting due dates.
**File:** `packages/services/src/installment.service.ts:818`
**Fix:** Wrap entire body in `tenantDb.transaction(async tx => {...})`, add `.for("update")` to both SELECT queries — installment first (matching confirmInstallmentPayment's lock order), then package.

---

### [HIGH] Phase E — `rescheduleInstallment` rejects "today" (uses `< now` not `< startOfDay`)
**Plan claims:** Phase E.1 changes date guard to `if (newDueDate < startOfDayUTC(now))` — accepts today.
**Actual:** Line 848 uses `if (newDueDate <= now)` comparing against the current moment. Any reschedule to today fails unless the exact scheduled time is in the future — rejects all admin-hour reschedules to today's date.
**File:** `packages/services/src/installment.service.ts:848`
**Fix:** Change to `if (newDueDate < startOfDayUTC(now))` where `startOfDayUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))`.

---

### [HIGH] Phase C — `evaluateAndLockIfOverdue` only marks first overdue installment
**Plan claims:** Phase C.1 replaces `findFirst` with a bulk UPDATE covering all pending installments with `dueDate < now`.
**Actual:** Lines 530–543 call `findFirst` to locate only one pending installment, then UPDATE only that row. Multi-overdue packages are misrepresented (partial `overdue` status, incomplete grace period calculation).
**File:** `packages/services/src/installment.service.ts:530`
**Fix:** Replace `findFirst` with bulk `UPDATE installments SET status = 'overdue' WHERE package_instance_id = ? AND status = 'pending' AND due_date < ? RETURNING id`, then batch-insert events for all returned IDs in one INSERT.

---

### [HIGH] Phase C — composite index missing; Phase D EXISTS subquery unoptimized
**Plan claims:** Phase C.2 adds `CREATE INDEX IF NOT EXISTS idx_installments_pkg_status_due ON installments(package_instance_id, status, due_date)`. This index also covers Phase D's EXISTS subquery.
**Actual:** Migration `0011_installments.sql` has only single-column indexes: `installments_package_instance_idx`, `installments_status_idx`, `installments_due_date_idx`. No composite index. Phase D's EXISTS subquery does a combined filter on `(package_instance_id, status)` — without the composite index it falls back to seq-scan on installments filtered by package_instance_id alone.
**File:** `packages/db/src/migrations/tenant/0011_installments.sql:54-56`
**Fix:** Create `packages/db/src/migrations/tenant/0069_installments_due_index.sql` (renumbered — see migration collision finding in schema-drift.md) with idempotent `CREATE INDEX IF NOT EXISTS` statement. Also add `.index("idx_installments_pkg_status_due").on(table.packageInstanceId, table.status, table.dueDate)` to the Drizzle schema file.

---

### [MEDIUM] Phase B — lock order for processRefund vs confirmInstallmentPayment unspecified
**Plan claims:** Phase B adds `FOR UPDATE` on `packageInstances` only (installment rows updated by predicate, no per-row lock needed).
**Actual:** `confirmInstallmentPayment` locks installment first (line 319), then package (line 330). `processRefund` with a package-only lock creates a potential deadlock if a concurrent `confirmInstallmentPayment` is in-flight: confirm holds installment lock, waits for package; refund holds package lock, waits for... nothing (no installment lock). This case is actually safe because processRefund doesn't need an installment-level lock. However, verify no path acquires both in opposite order.
**File:** `packages/services/src/installment.service.ts:764, 319`
**Fix:** Document the analysis explicitly in code: "processRefund locks only the package (no per-row installment lock needed); bulk UPDATE by packageInstanceId is predicate-locked, no deadlock risk with confirmInstallmentPayment."

---

### [MEDIUM] Phase B — `processRefund` does not support partial refund mode
**Plan claims:** Phase B.1 accepts `opts?: { partialRefund?: boolean }` — if `partialRefund`, package stays active.
**Actual:** Line 771 signature has no `opts` parameter. Line 777 always sets `status: 'cancelled'` unconditionally. No partial refund path exists.
**File:** `packages/services/src/installment.service.ts:764, 777`
**Fix:** Add optional `opts` parameter, branch on `opts?.partialRefund` to conditionally skip setting `status: 'cancelled'` on the package.

---

### [LOW] Phase C — locking path does not clear `gracePeriodEndsAt`
**Plan claims:** Phase C.1 states "When transitioning to locked: set `nextDueDate = null`, `gracePeriodEndsAt = null`."
**Actual:** Lines 573–582 set `isLocked: true` and `lockedReason: 'non_payment'` but do NOT set `gracePeriodEndsAt: null`. Stale `gracePeriodEndsAt` survives the lock transition — confusing for any code that checks it to determine whether grace is active.
**File:** `packages/services/src/installment.service.ts:573`
**Fix:** Add `gracePeriodEndsAt: null` to the locked-state SET clause.

---

### [INFO] Phase H — `createInstallmentSchedule` signature not yet updated
**Plan claims:** Phase H.1 changes signature to accept `TenantDb | TenantTx`, removes cast at POS call site.
**Actual:** Line 214 signature still accepts `NeonDatabase<typeof tenantSchema>` only. `pos.service.ts` line 635 still has the `tx as unknown as TenantDb` cast. Not yet implemented — Phase H is pending.
**File:** `packages/services/src/installment.service.ts:214`
**Fix:** Implement Phase H.1 (signature broadening + withTx helper). No production risk until then — cast is functionally safe.

---

## Summary

Three CRITICAL concurrency bugs exist today and are not yet fixed: `processRefund` leaves phantom pending installments (no bulk cancel), lacks `FOR UPDATE` on the package (race with concurrent payment confirmation), and `rescheduleInstallment` is entirely unlocked (double-reschedule race). Two HIGH findings cover the "today" date guard regression and the single-overdue-per-sweep bug. The composite index for Phase D's EXISTS subquery does not exist yet — it must be created before the overdue filter change deploys. All CRITICAL and HIGH issues require code changes; none are auto-fixable in the plan document.
