# Audit Swarm Final Summary

**Session:** 05-07_10-02_status-history
**Date:** 2026-05-07
**Passes completed:** 2
**Plan file:** `zplan/05-07_10-02_status-history/plan/plan.md`

---

## Total Finding Counts

| Pass | CRITICAL | HIGH | MEDIUM | LOW | INFO |
|------|----------|------|--------|-----|------|
| Pass 1 | 4 | 4 | 8 | 2 | 12 |
| Pass 2 | 0 | 2 | 6 | 3 | 5 |
| **Total unique** | **4** | **6** | **14** | **5** | **17** |

---

## What Was Fixed

### Pass 1 Fixes Applied to `plan.md`

| ID | Severity | Finding | Fix Applied |
|----|----------|---------|-------------|
| C1 | CRITICAL | `sales_management` → wrong permission resource | Corrected to `"sales"` throughout |
| C3 | CRITICAL | `financial_management` → wrong permission resource | Corrected to `"payments"` |
| C4 | CRITICAL | Cursor parsing unguarded against malformed input | `parseCursor()` guard function added |
| H3 | HIGH | `changedAt: Date \| string` overly permissive | Narrowed to `changedAt: Date` |
| H4 | HIGH | Name resolution N+1 risk | Batch pattern pseudocode added to section 3.4 |
| — | HIGH | `notes` missing from `StatusTimelineProps` entries | Added to interface |
| — | MEDIUM | `nextCursor` inside row object (wrong) | Moved to response-level `{ rows, nextCursor }` |
| — | MEDIUM | `users` import alias wrong in pseudocode | Changed to `cpUsers` (matches `appointments.ts` pattern) |
| Q1 | MEDIUM | Payment router ambiguity | Resolved: Option B, `invoices.paymentStatusHistory` |
| Q2 | MEDIUM | `payments.service.ts` existence unknown | Resolved: create new file |
| H2 | HIGH | No test for `evaluateAndExpireIfOverdue` fix | Test skeleton added to plan section 6 |
| — | MEDIUM | Generic `entityId` in input schema | Changed to entity-specific keys (`salesOrderId`, etc.) |

### Pass 2 Fixes Applied to `plan.md`

| ID | Severity | Finding | Fix Applied |
|----|----------|---------|-------------|
| P2-H1 | HIGH | `users` alias in pseudocode should be `cpUsers` | Fixed with import comment |
| P2-H2 | HIGH | `encodeCursor` function missing | Added to new `packages/api/src/lib/cursor.ts` spec |
| P2-M2 | MEDIUM | `existing.status` → wrong variable name | Fixed to `pkg.status` |
| P2-M3 | MEDIUM | No read-path integration test | Added Phase 1 acceptance criteria checklist |
| P2-M4 | MEDIUM | `rows → entries` mapping not shown | Added UI query pattern with explicit mapping |
| P2-M5 | MEDIUM | `parseCursor` duplicated across 4 handlers | Moved to shared `packages/api/src/lib/cursor.ts` |
| P2-M6 | MEDIUM | `fromStatus` null guard not shown | Added JSX guard snippet to Phase 2 component spec |
| P2-Scalability | MEDIUM | N+1 fetch pagination pattern missing | Added canonical N+1 detect + `encodeCursor` pattern |

---

## Remaining Open Issues (Not Auto-Fixable)

### C2 — `package_management` permission resource does not exist [HUMAN DECISION REQUIRED]

**Location:** Plan section 3.4, Phase 2 items 5 and 8

The `packageInstances.statusHistory` procedure needs a permission check. `"package_management"` is not in the `Resource` union in `packages/services/src/permission.service.ts`.

**Options:**
- **(A) Preferred:** Add `"package_management"` to the `Resource` union type in `permission.service.ts`, then seed the appropriate `permissions` rows in the tenant DB. This is the cleanest long-term solution.
- **(B) Expedient:** Gate on `"sales"` permission (packages are purchased items). Functionally correct but semantically loose.

**Decision must be made before Phase 2 implementation begins.** Both options require a code change — Option A requires also updating the DB permission seeding script.

---

## Plan Quality Assessment (After Both Passes)

| Dimension | Before Audits | After Audits |
|-----------|--------------|-------------|
| Permission resource names | 3 wrong out of 4 | All correct (1 open decision) |
| Output type accuracy | Missing `notes`, wrong `changedAt`, `nextCursor` misplaced | Correct |
| Cursor design | Missing guard, missing `encodeCursor`, missing N+1 pattern | Complete |
| Name resolution | Correct concept, wrong alias, N+1 risk | Batch pattern with correct imports |
| Write gap fix | Code snippet had wrong variable name | Corrected |
| Test coverage | No test for expiry fix, no read test | Both now in acceptance criteria |
| File locations | All 4 routers confirmed, 2 open questions resolved | Clean |
| Schema | Clean from start | Clean |

---

## Implementation Readiness

**Phase 1** (Sale Detail timeline): **READY TO IMPLEMENT** — all decisions resolved, acceptance criteria defined, cursor utility specified.

**Phase 2** (Appointment + Package Instance drawers): **BLOCKED on C2 decision** — requires choosing between Option A or Option B for `packageInstances.statusHistory` permission resource before coding starts. All other Phase 2 decisions are resolved.

**Phase 3** (Payment timeline + write gap fix): **READY TO IMPLEMENT** — `payments.service.ts` creation decision made, `invoicesRouter` placement confirmed, test requirement documented.
