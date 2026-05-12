# Test Coverage Audit — Pass 1
**Lens:** test-coverage-auditor
**Date:** 2026-05-07

## Summary

Mapped plan §7 acceptance criteria against existing tests in `apps/server/src/tests/` and plan-proposed tests.

---

## Existing Coverage

### [INFO] `resolveServicePrice` chain — COVERED
- `apps/server/src/tests/integration/pricing.test.ts` has 5 tests covering:
  - (a) no overrides → fallback to services.price
  - (b) org-wide override
  - (c) branch-specific override
  - (d) customer-type-specific
  - (e) expired override fallthrough
- **Gap: Does NOT cover `customerType = "member"` or `"walk_in"` specifically** — uses `"vip"` in test (d). For this plan, `"member"` and `"walk_in"` are the valid values. Not a regression risk but a coverage gap.

---

## Plan-Proposed Tests (§7)

| Test | Proposed Location | Status | Severity |
|---|---|---|---|
| `expireServicePrice` — sets effectiveUntil to now | `packages/services/src/__tests__/pricing.service.test.ts` (unit) | **MISSING** — no such test file | CRITICAL |
| `services.setBranchPrice` — rejects inaccessible branch | Integration test | **PARTIALLY COVERED** — the handler has branch-access logic but no integration test verifies the rejection | HIGH |
| POS `items-step` — price auto-fills on service select | Vitest component test | **MISSING** — no POS component tests exist | CRITICAL |
| POS fallback — resolvePrice null → price = 0 + warning shown | Vitest component test | **MISSING** | CRITICAL |

---

## CRITICAL Missing: Service-layer unit test file

- Plan references `packages/services/src/__tests__/pricing.service.test.ts` — this file does **not exist**.
- The integration test in `apps/server/src/tests/integration/pricing.test.ts` tests end-to-end, but there is no unit test for the new `expireServicePrice` / `expireProductPrice` / `deleteServicePrice` / `deleteProductPrice` functions.
- `expireServicePrice` is a financial mutation (sets a price row's effective window) — zero unit test coverage is CRITICAL.

## CRITICAL Missing: POS component tests

- Plan §7 proposes two Vitest component tests for `items-step.tsx`:
  1. Price auto-fills on service select (mock `resolvePrice` response)
  2. Fallback: resolvePrice returns null → price = 0 + warning banner shown
- No `apps/web/src/__tests__/pos/` directory exists.
- These test the price-resolution mutation path for POS — CRITICAL financial accuracy concern.

## HIGH Missing: `deleteBranchPrice` authorization test

- Plan §8 Q4 says `deleteBranchPrice` requires `service_management:delete` (admin-only).
- No integration test verifies that a staff member without delete permission is rejected.
- This is a **financial authorization mutation** — missing auth test is HIGH.

## HIGH Missing: `expireBranchPrice` tenant isolation test

- Plan §7 error handling (§7 ¶2) says `expireBranchPrice` with a priceId not belonging to the caller's tenant should throw NOT_FOUND.
- No test for cross-tenant price row access exists.

## MEDIUM Missing: `listServicePriceOverrides` filtering test

- The plan's UI expects the list to show active overrides only (filtered by `at`).
- Integration test (e) in pricing.test.ts verifies the expired override falls through in `resolveServicePrice` but does **not** verify that `listServicePriceOverrides` excludes expired rows.

## LOW Note: `resolveProductPrice` has zero test coverage

- The existing pricing.test.ts only tests service price resolution.
- Product price resolution uses the same `pickMostSpecific` logic but via a separate query path.
- Plan does not add product pricing tests. Low risk (same logic) but worth noting.

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| `expireServicePrice` unit test missing | CRITICAL | No |
| POS `items-step` component tests missing | CRITICAL | No |
| `deleteBranchPrice` auth rejection test missing | HIGH | No |
| `expireBranchPrice` tenant isolation test missing | HIGH | No |
| `listServicePriceOverrides` expired-row exclusion test missing | MEDIUM | No |
| `resolveProductPrice` has zero coverage | LOW | No |
