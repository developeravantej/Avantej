# Test Coverage Audit — Pass 1

**Auditor:** test-coverage-auditor
**Date:** 2026-05-07

---

## Summary

Existing write-path tests cover all four entities. No API read-path tests exist (expected — procedures not implemented yet). The plan does not specify tests for the new read procedures or the `evaluateAndExpireIfOverdue` fix. This is a gap.

---

## Existing Coverage

### CONFIRMED — Write-path integration tests exist

`apps/server/src/tests/integration/status-history.test.ts` contains:

1. `sales_order status update writes a history row (draft → confirmed)` — calls `updateSalesOrder`, asserts history row ✓
2. `payment status mutation via helper writes a history row (pending → succeeded)` — calls `appendPaymentStatusHistory` directly ✓
3. `package_instance status update writes a history row (pending → active)` — calls `updatePackageInstance`, asserts history row ✓
4. `appointment status mutation via helper writes a history row (pending → confirmed)` — calls `appendAppointmentStatusHistory` directly ✓

All four entities have at least one write-path test.

---

## Gaps

### CRITICAL — No test for `evaluateAndExpireIfOverdue` write-path fix

The plan identifies `evaluateAndExpireIfOverdue` in `installment.service.ts` as a write gap (sets `status = "expired"` without writing history). The plan proposes adding `appendPackageInstanceStatusHistory` to this function.

**No test exists** that:
- Calls `evaluateAndExpireIfOverdue` with an overdue package instance
- Asserts that a `package_instance_status_history` row with `toStatus = "expired"` was written

This is the only mutating fix in the plan. A write mutation fix without a test verifying the fix is a CRITICAL gap.

**Required test:** Add a test in `status-history.test.ts` (or a new file) that:
1. Inserts a `packageInstances` row with `status = "active"` and `expiresAt` in the past
2. Calls `evaluateAndExpireIfOverdue(tenantDb, pkg.id)`
3. Asserts `packageInstances.status === "expired"`
4. Asserts one row in `packageInstanceStatusHistory` with `fromStatus = "active"`, `toStatus = "expired"`, `changedBy = "system"`

---

### HIGH — No test for any new read procedure

The plan adds `statusHistory` procedures to four routers. No plan section specifies tests for these API procedures. At minimum:

- `salesOrders.statusHistory` should have a test that:
  1. Seeds a sales order with known history rows
  2. Calls the procedure
  3. Asserts the returned rows match (including cursor pagination behavior)
  4. Asserts `changedByName` is resolved correctly (including "system" → "System" mapping)

- Permission guard tests: assert that a member without `sales:read` gets FORBIDDEN.

These are missing from the plan's acceptance criteria.

---

### MEDIUM — Cursor pagination not tested

The plan specifies cursor-based pagination on `(changedAt DESC, id DESC)`. No test verifies:
- That `nextCursor` is non-null when results exceed `limit`
- That the second page correctly uses the cursor to return the next batch
- That out-of-order insertion doesn't break pagination ordering

---

### MEDIUM — Name resolution not tested

The plan specifies batch-query against `auth.user` for `changedBy` name resolution. No test verifies:
- That a known user ID resolves to the expected name
- That `"system"` maps to `"System"`
- That a deleted user ID falls back to `"Unknown User"`

---

### INFO — Appointment drawer and package drawer UI tests not specified

The plan (Phase 2) adds sheet/drawer UI components. No Playwright or frontend unit tests are specified. This is acknowledged scope (UI changes require manual verification per CLAUDE.md) but is worth flagging.

---

## Required Additions to Plan

1. Add acceptance criteria item: "Integration test for `evaluateAndExpireIfOverdue` history write (CRITICAL)"
2. Add acceptance criteria item: "Integration test for `salesOrders.statusHistory` read procedure with cursor pagination"
3. Add acceptance criteria item: "Integration test for permission gate on `statusHistory` procedures"
