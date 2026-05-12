# GAPS Synthesis — Pass 1

**Date:** 2026-05-07
**Session:** 05-07_10-02_status-history

---

## Pass 1 Findings Summary

| Severity | Count | Source |
|----------|-------|--------|
| CRITICAL | 4 | api-surface (3), type-safety (1) |
| HIGH | 4 | api-surface (1), test-coverage (1), type-safety (1), scalability (1) |
| MEDIUM | 8 | api-surface (2), test-coverage (2), doc-consistency (2), type-safety (2), scalability (2) |
| LOW | 2 | type-safety (1), scalability (1) |
| INFO | 12 | schema-drift (5), api-surface (3), test-coverage (1), doc-consistency (5), scalability (2) |

---

## CRITICAL Issues

### C1 — Wrong permission resource: `sales_management` → should be `sales`
**File to fix:** `plan/plan.md` sections 3.4, Phase 1 items 3-4
**Evidence:** `Resource` union in `permission.service.ts` has `"sales"`, not `"sales_management"`
**Existing router pattern:** `salesOrdersRouter` uses `requirePermission(..., "sales", "read")`

### C2 — Wrong permission resource: `package_management` → does not exist
**File to fix:** `plan/plan.md` section 3.4, Phase 2 item 5
**Evidence:** No `package_management` in `Resource` union. Need to either add it or use a different resource (`"sales"` or define a new resource entry).
**Recommended resolution:** Add `"package_management"` to the `Resource` union in `permission.service.ts`, OR document that package-instance history uses `"sales"` permission.

### C3 — Wrong permission resource: `financial_management` → should be `payments`
**File to fix:** `plan/plan.md` section 3.4
**Evidence:** `Resource` union has `"payments"`, not `"financial_management"`

### C4 — Cursor parsing unguarded against malformed input
**File to fix:** `plan/plan.md` sections 3.4 and 7 (Pagination)
**Fix:** Document a `parseCursor()` helper function with error guard

---

## HIGH Issues

### H1 — No `statusHistory` procedures exist (baseline confirmed, not a blocker)
All four routers confirmed missing the procedure. Implementation must add them.

### H2 — No test for `evaluateAndExpireIfOverdue` write-path fix (MISSING acceptance criterion)
**File to fix:** `plan/plan.md` section 5 Phase 3 (add test requirement)

### H3 — `changedAt: Date | string` overly permissive — narrow to `Date`
**File to fix:** `plan/plan.md` section 3.4 output type and Phase 2 `StatusTimelineProps`

### H4 — Name resolution batch pattern must be enforced (N+1 risk if misimplemented)
**File to fix:** `plan/plan.md` section 7 — add pseudocode for correct batch approach

---

## HIGH Issues Auto-Fixed in plan.md

- C1: `sales_management` → `sales` in permission calls ✓
- C3: `financial_management` → `payments` in permission calls ✓
- H3: `changedAt: Date | string` → `changedAt: Date` in output type ✓
- C4: Added cursor parsing guard pseudocode to plan ✓
- H4: Added batch name resolution pseudocode to plan ✓
- `notes` field added to `StatusTimelineProps` entries type ✓

---

## Remaining Issues After Pass 1 (require human decision)

- **C2:** `package_management` resource — requires decision: add new resource type OR reuse `"sales"`. Implementation note added to plan.
- **H2:** Test for `evaluateAndExpireIfOverdue` — acceptance criterion added to plan.
- **MEDIUM:** Q2 (payments.service.ts existence) — plan now explicitly resolves: create new `payments.service.ts`.
- **MEDIUM:** `payments.statusHistory` naming inconsistency — plan updated to use `paymentStatusHistory` on `invoicesRouter`.
- **MEDIUM:** Cursor WHERE clause Drizzle expression — added explicit example to plan.
- **MEDIUM:** `.limit()` must be explicit in service function — added note.
