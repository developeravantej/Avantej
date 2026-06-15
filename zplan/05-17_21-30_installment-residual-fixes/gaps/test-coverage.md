# Test Coverage Audit
**Session:** zplan/05-17_21-30_installment-residual-fixes/
**Findings:** 7 (0 critical · 4 high · 2 medium · 1 low · 0 info)

## Findings

### [HIGH] Phase A test file not created
**Plan claims:** `apps/server/src/tests/pos.installment.integration.test.ts` (new) — integration test asserting insert-time `paymentStatus = "partially_paid"` correctness before `syncPackagePaymentStatus` is called.
**Actual:** File does not exist. No test covers the insert-time paymentStatus assertion.
**File:** N/A (missing)
**Fix:** Create file with test asserting package row reads `paymentStatus = "partially_paid"` before `syncPackagePaymentStatus` is called (use transaction rollback to observe mid-tx state).

---

### [HIGH] Phase B test file not created
**Plan claims:** `apps/server/src/tests/installment-refund.integration.test.ts` (new) — 4-installment package, pay #1, call `processRefund`, assert installments #2-#4 status = `'cancelled'`.
**Actual:** File does not exist. `processRefund` is not tested for installment-cancellation behavior in any existing test file.
**File:** N/A (missing)
**Fix:** Create file with integration test seeding 4 installments, confirming #1, calling processRefund, asserting #2-#4 are `'cancelled'`.

---

### [HIGH] Phase C test file not created
**Plan claims:** `apps/server/src/tests/installment-evaluator.integration.test.ts` (new) — 3 installments due 60/30/1 days ago, assert all 3 marked `overdue` and `gracePeriodEndsAt` set once.
**Actual:** File does not exist. `evaluateAndLockIfOverdue` multi-overdue behavior is untested.
**File:** N/A (missing)
**Fix:** Create file with two tests: (a) multi-overdue → all rows marked overdue + gracePeriodEndsAt set; (b) grace expired → isLocked=true, nextDueDate=null.

---

### [HIGH] Phase D test file not created
**Plan claims:** `apps/server/src/tests/installment-overview.integration.test.ts` (new) — package with `nextDueDate` 5 minutes ago (no evaluator run) appears in "Overdue" filter.
**Actual:** File does not exist. The "overdue without evaluator" scenario has zero test coverage. Existing installment tests do not cover `getAdminInstallmentOverview` filter accuracy.
**File:** N/A (missing)
**Fix:** Create file with test: seed package with `nextDueDate = now - 5 min`, no evaluator run, call `getAdminInstallmentOverview({ status: "overdue" })`, assert it appears.

---

### [MEDIUM] Phase E test file not created
**Plan claims:** `apps/server/src/tests/installment-reschedule.integration.test.ts` (new) — concurrent reschedule race + today-date acceptance.
**Actual:** File does not exist. No integration test for `Promise.all([reschedule, reschedule])` or today-date validation.
**File:** N/A (missing)
**Fix:** Create file with two tests: (a) two concurrent reschedules via Promise.all → one resolves, one throws CONFLICT; (b) reschedule to today succeeds, yesterday throws BAD_REQUEST.

---

### [MEDIUM] Phase F test file not created
**Plan claims:** `apps/server/src/tests/installment-credits.integration.test.ts` (new) — waive credit semantics + resetCreditsOverride.
**Actual:** File does not exist. No integration test for `installmentsWaived` counter or `resetCreditsOverride` behavior.
**File:** N/A (missing)
**Fix:** Create file with two tests: (a) pay #1, waive #2 → installmentsPaid=1, installmentsWaived=1, creditsUnlocked=half; (b) adjustCredits then resetCreditsOverride → flag cleared, credits=formula.

---

### [LOW] Phase H cast exists — new tests will inherit type unsafety until H.1 implemented
**Plan claims:** Phase H acceptance: "`bun check-types` clean, existing POS installment integration test passes." Implies the `as unknown as TenantDb` cast is removed before tests run.
**Actual:** `pos.service.ts` lines 315, 352, 635 still use the cast. `createInstallmentSchedule` signature still accepts only `NeonDatabase<typeof tenantSchema>`. Phase A's new test will either inherit the cast or fail type-check until Phase H.1 (signature broadening) is implemented first.
**File:** packages/services/src/pos.service.ts:315, 352, 635
**Fix:** Implement Phase H.1 before Phase A test file creation to avoid a circular type-check failure.

---

## Integration helper availability

`apps/server/src/tests/helpers/integration-setup.ts` exports `createTenantDb()`, `makeIntegrationAdminContext()` — fully adequate for all planned test files. No missing helper imports.

**Neon pool concurrency note (Phase E.5):** `createTenantDb()` creates a `new Pool({ connectionString: url })` with no explicit `max` setting. Concurrent `Promise.all` for the race test relies on pool having ≥2 connections available. At default settings this is fine; document the assumption in the Phase E.5 test file.

---

## Summary

All seven planned integration test files are absent. The four HIGH findings cover the most critical financial mutation paths: insert-time status correctness (Phase A), refund installment cancellation (Phase B), multi-overdue evaluator sweep (Phase C), and filter accuracy under timing gaps (Phase D). Phase H's type cast must be resolved before Phase A tests can pass type-check cleanly. The integration helper infrastructure is adequate for all test files — no missing imports block creation.
