# Test Coverage Audit — Pass 2

**Auditor:** test-coverage-auditor
**Date:** 2026-05-07
**Based on:** Updated plan.md after Pass 1 fixes

---

## Summary

Pass 1 CRITICAL test gap (H2 — `evaluateAndExpireIfOverdue`) is now documented in the plan with a required test skeleton. No new CRITICAL gaps found. One HIGH gap remains: the plan still does not specify a test for the read procedures (API-level test for `salesOrders.statusHistory` with cursor + permission). One MEDIUM: the test for the expiry fix uses `fromStatus: "active"` but the function only runs when `pkg.status === "active"` (per line 418 of `installment.service.ts`) — test setup must ensure this precondition.

---

## Findings

### CONFIRMED — H2 test requirement now in plan

Plan section 6 now contains an explicit test skeleton:
```typescript
test("evaluateAndExpireIfOverdue writes history row (active → expired)", async () => { ... })
```
with 4 assertion steps. This is sufficient as acceptance criteria. ✓

### HIGH — No read-path API test specified anywhere in plan

The plan adds four new read procedures. No test in `apps/server/src/tests/` is specified for any of them. The existing `status-history.test.ts` covers only write paths. 

Minimum required: one integration test for `getSalesOrderStatusHistory` at the service layer (not router layer, which is harder to test) verifying:
1. Returns rows in `changedAt DESC` order
2. Returns `nextCursor` when `rows.length === limit`
3. Using the cursor returns the next page without duplicates

These tests are not specified anywhere in the plan. This leaves the cursor pagination logic unverified.

**Recommended addition to Phase 1 acceptance criteria:** "Integration test for `getSalesOrderStatusHistory`: seed 3 history rows, call with limit=2, verify first page has 2 rows and nextCursor, call with cursor, verify second page has 1 row and nextCursor=null."

### MEDIUM — `evaluateAndExpireIfOverdue` test precondition: `pkg.status` must be `"active"`

The function has this early-exit guard (line 418):
```typescript
if (!pkg || pkg.status !== "active") return;
```

The test skeleton says "Insert packageInstances with status='active' and expiresAt in the past" — this is correct. However, the function also checks `!pkg.expiresAt || pkg.expiresAt > now` (line 419) — the test must set `expiresAt` to a past date. The skeleton implies this ("expiresAt in the past") but it should be made explicit since missing this will cause the function to return early and the test will pass vacuously.

**Fix for test skeleton:**
```typescript
const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // 1 day ago
// insert packageInstances with { status: "active", expiresAt: pastDate }
```

### LOW — No test for the `"system"` → `"System"` name resolution mapping

The plan documents this mapping but no test verifies it. A unit test for `parseCursor` and name resolution logic would close this gap. These are pure functions and easy to test. Consider adding them to the unit test suite.

### INFO — Existing `status-history.test.ts` is rerunnable and uses proper cleanup

The test file uses `afterAll` cleanup with explicit deletes in reverse dependency order. The new `evaluateAndExpireIfOverdue` test should follow the same pattern: push to `createdPackageInstanceIds` and let `afterAll` clean up.

---

## Verdict

One HIGH gap remains (read-path test). H2 fix is properly documented. Recommend adding read-path test requirement to plan before implementation.
