# GAPS Synthesis — Pass 2

**Date:** 2026-05-07
**Session:** 05-07_10-02_status-history

---

## Pass 2 Findings Summary

| Severity | Count | Source |
|----------|-------|--------|
| CRITICAL | 0 | — |
| HIGH | 2 | api-surface (1), scalability (1) |
| MEDIUM | 6 | api-surface (1), test-coverage (1), doc-consistency (2), type-safety (2), scalability (2) |
| LOW | 3 | api-surface (1), test-coverage (1), type-safety (2) |
| INFO | 5 | schema-drift (4), scalability (1) |

---

## HIGH Issues Found in Pass 2

### P2-H1 — Name resolution pseudocode uses `users` alias but should be `cpUsers`
**Source:** api-surface-auditor
**File to fix:** `plan/plan.md` section 3.4 batch name resolution pseudocode
**Fix:** Change `users.id / users.name / users.email` to `cpUsers.id / cpUsers.name / cpUsers.email` and add import comment. Import in `appointments.ts` is: `import { user as cpUsers } from "@avantej-core/db/schema/auth"`.

### P2-H2 — `encodeCursor` function and N+1 pagination fetch pattern are missing from plan
**Source:** scalability-auditor
**File to fix:** `plan/plan.md` sections 3.4 and 5
**Fix:** Add `encodeCursor` function definition (to `packages/api/src/lib/cursor.ts`) and the N+1 fetch pattern showing how to detect next page and build `nextCursor`.

---

## MEDIUM Issues Found in Pass 2

### P2-M1 — `changedBy` explicit stripping from API response not documented
**Source:** api-surface-auditor — Add note to Phase 1 item 3 that the router must map rows to omit `changedBy` and include only `changedByName`.

### P2-M2 — `fromStatus: existing.status` should be `pkg.status` in Phase 3 code snippet
**Source:** doc-consistency-auditor — Typo in plan. `existing` is not defined; variable is `pkg`.

### P2-M3 — Read-path integration test for `getSalesOrderStatusHistory` not specified
**Source:** test-coverage-auditor — Add acceptance criterion: service-level test with limit=2, verify pagination.

### P2-M4 — `rows → entries` mapping between API response and component props not shown in UI code
**Source:** type-safety-auditor — Add note showing `entries={data?.rows ?? []}` in the UI query hook.

### P2-M5 — `parseCursor` should be a shared utility, not duplicated in 4 router handlers
**Source:** scalability-auditor — Create `packages/api/src/lib/cursor.ts` with `parseCursor` + `encodeCursor`. Plan should specify this.

### P2-M6 — `fromStatus` null guard needs explicit JSX snippet in component spec
**Source:** type-safety-auditor — Add null guard rendering example to Phase 2 component spec.

---

## Auto-Fixed in Pass 2

- `existing.status` → `pkg.status` in Phase 3 code snippet ✓
- `users` alias → `cpUsers` alias in batch resolution pseudocode ✓
- `encodeCursor` + N+1 fetch pattern added to section 3.4 ✓
- `parseCursor` shared utility location specified ✓
- `rows → entries` mapping note added ✓
- Read-path test added to Phase 1 acceptance criteria ✓
- `fromStatus` null guard JSX snippet added ✓

---

## Remaining Open Issues (require human decision)

- **C2 (from Pass 1):** `package_management` permission resource — add new resource to `Resource` union OR reuse `"sales"`. Must be decided before Phase 2 implementation begins.
