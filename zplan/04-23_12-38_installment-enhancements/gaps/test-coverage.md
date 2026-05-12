# Test Coverage Audit
**Session:** zplan/04-23_12-38_installment-enhancements
**Findings:** 12 (3 critical · 4 high · 3 medium · 2 low)

## Findings

### [CRITICAL] AC1–AC3 (due_soon filter) — zero coverage, feature not implemented
**Plan claims:** Unit tests in `installment.test.ts` will cover: nextDueDate in 5d → included; 20d → excluded; grace period → excluded; locked → excluded. Frontend test covers Due Soon tab rendering.
**Actual:** `getAdminInstallmentOverview` does not have a `due_soon` branch yet. Router enum is `["active","overdue","locked"]`. No test file covers these cases.
**File:** `packages/services/src/installment.service.ts:866`; `packages/api/src/routers/installments.ts:214`
**Fix:** Implement filter branch (Phase 1 Task 1.1), then add 4–5 unit test cases in `installment.test.ts`.

---

### [CRITICAL] AC4–AC7 (setPackageOverdraft service) — zero coverage, not implemented
**Plan claims:** Unit tests for enable/disable/idempotent no-op/not-found error cases.
**Actual:** Function does not exist. Schema column absent. No tests.
**File:** N/A (Phase 3 + 4 work)
**Fix:** Phase 3 adds column; Phase 4 adds function + unit tests in `installment.test.ts`.

---

### [CRITICAL] AC8–AC10 (appointment booking with overdraft flag) — zero coverage
**Plan claims:** Booking succeeds when `isLocked=true AND allowCreditOverdraft=true`; fails when flag is false.
**Actual:** `appointment.service.ts:264` still has the unmodified `if (lockedPkg.isLocked)` check. `appointment.service.test.ts` does not exist.
**File:** `packages/services/src/appointment.service.ts:264`
**Fix:** Phase 4 Task 4.3 modifies the condition; Task 4.5 creates `appointment.service.test.ts` with 3 cases.

---

### [HIGH] AC11 (integration test) — file does not exist
**Plan claims:** Phase 4 Task 4.6 writes to `apps/server/src/tests/integration/installments.integration.test.ts`.
**Actual:** Only `installment-plans.integration.test.ts` exists in that directory. The target file must be created, not modified.
**File:** `apps/server/src/tests/integration/`
**Fix:** Clarify Task 4.6 as "create" not "add to existing". Integration helpers (`makeIntegrationAdminContext`) exist and are compatible.

---

### [HIGH] AC12 (frontend overdraft toggle test) — file and directory absent
**Plan claims:** `apps/web/src/__tests__/pages/packages/installments-page.test.tsx` tests the overdraft dialog.
**Actual:** Directory `apps/web/src/__tests__/pages/packages/` does not exist (only a `pages/trainer-tiers.test.tsx` sibling).
**File:** `apps/web/src/__tests__/pages/`
**Fix:** Phase 5 Task 5.5 must create the directory and file. Not a blocker — just requires explicit `mkdir -p` equivalent.

---

### [HIGH] Router enum not extended — Phase 1 Task 1.1 not started
**Plan claims:** `adminOverview` status enum includes `"due_soon"`.
**Actual:** Enum is `["active","overdue","locked"]` at line 214.
**File:** `packages/api/src/routers/installments.ts:214`
**Fix:** Extend enum in Phase 1 Task 1.1 before frontend ships.

---

### [HIGH] Mock factory missing query tables for new tests
**Plan claims:** Unit tests use `createMockTenantDb()` from `db-mock.factory.ts`.
**Actual:** Factory (lines 88–106) does not include `query.packageInstances`, `query.installments`, or `query.installmentEvents`. Any unit test calling these on the mock will throw `undefined`.
**File:** `apps/server/src/tests/helpers/db-mock.factory.ts:88–106`
**Fix:** Add the three missing query table mocks to the factory before writing Phase 4 unit tests.

---

### [MEDIUM] Integration helper requires `.dev.vars` with `TENANT_DATABASE_URL`
**Plan claims:** `makeIntegrationAdminContext()` is ready to use.
**Actual:** The function exists and is correct but silently fails if `.dev.vars` is missing or does not contain `TENANT_DATABASE_URL`.
**File:** `apps/server/src/tests/helpers/integration-setup.ts:73–96`
**Fix:** Document prerequisite in Phase 4 Task 4.6 execute notes.

---

### [MEDIUM] Frontend mock client missing `installments` namespace
**Plan claims:** Frontend tests mock `@/utils/orpc`; `setOverdraft` is callable.
**Actual:** `mock-client.ts` (lines 111–127) includes `packageInstances.*` but has no `installments` object.
**File:** `apps/web/src/__tests__/helpers/mock-client.ts:111–127`
**Fix:** Add `installments: { setOverdraft: vi.fn().mockResolvedValue({}) }` to the mock before Phase 5 Task 5.5.

---

### [MEDIUM] Existing installment.test.ts needs new describe blocks (not a new file)
**Plan claims:** "add tests to existing file if present".
**Actual:** File exists (258 lines, covers `evaluateAndLockIfOverdue` etc.). New describe blocks for `due_soon` filter and `setPackageOverdraft` can be appended.
**File:** `apps/server/src/tests/unit/services/installment.test.ts`
**Fix:** Append; no structural conflict.

---

### [LOW] appointment.service.ts lock check — all usages should be grepped before Phase 4
**Plan claims:** Single `isLocked` check at line 264.
**Actual:** Not verified across the full file. Plan itself notes "grep for `isLocked` across `packages/services/src`" before Phase 4 — confirm this step is executed.
**File:** `packages/services/src/appointment.service.ts`
**Fix:** Run `grep -n "isLocked" packages/services/src/*.ts` as a pre-Phase-4 gate.

---

### [LOW] check-ins.service.ts comment — documentation only, no coverage gap today
**Plan claims:** Comment should be added if the check-ins service ever gains an `isLocked` check.
**Actual:** No current coverage gap; this is a pre-emptive reminder.
**File:** `packages/services/src/check-ins.service.ts`
**Fix:** Add one-line comment in Phase 4 if applicable.

---

## Summary

Zero implementation has started on any of the plan's 12 acceptance criteria. Three critical coverage gaps (due_soon filter tests, setPackageOverdraft tests, appointment overdraft tests) represent the core feature risk. The test infrastructure has two blockers that must be fixed before writing Phase 4 unit tests: the mock factory is missing three query table mocks, and the frontend mock client has no `installments` namespace. All existing test helpers (integration-setup, render-with-providers, vitest configs) are otherwise compatible with what the plan needs.
