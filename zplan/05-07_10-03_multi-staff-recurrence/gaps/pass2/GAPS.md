# Pass 2 — Gap Synthesis

**Date:** 2026-05-07  
**Auditors:** schema-drift, api-surface, test-coverage, doc-consistency, type-safety, scalability (Pass 2)

---

## New CRITICAL Findings (Pass 2)

| ID | Source | Finding |
|----|--------|---------|
| AS-P2-004 | api-surface | `package_management` permission not just missing from TypeScript type — it also must be SEEDED in the tenant `permissions` DB table. Without seeding, all `packageInstanceStaff` calls fail even for admins. Need to check how permissions are seeded and add `package_management` to the seed/migration. |

---

## New HIGH Findings (Pass 2)

| ID | Source | Finding |
|----|--------|---------|
| SD-P2-001 | schema-drift | EXCLUSION constraint `appointments_trainer_no_overlap` fires when `appointments.trainerId` is updated. Phase 1.1 updateAppointment staff replace pseudocode does NOT update `trainerId` when slot 0 changes — plan section 6 mentions it but the Phase 1.1 implementation pseudocode omits the step. |
| AS-P2-002 | api-surface | `appointments.list` must exclude materialized child rows (`recurringParentId IS NOT NULL`) after Phase 2. Plan Phase 2.3 implementation text does not include this WHERE clause. |
| TS-P2-001 | type-safety | `DAYS` keys in RepeatRuleSection are string abbreviations ("M", "T", "TH", etc.), not ISO weekday numbers. The `mapCustomRecurrenceToParams` adapter must include explicit key-to-number mapping. Without it, recurring series created on wrong days. |
| TC-P2-001 | test-coverage | No test for EXCLUSION constraint interaction: changing slot 0 to a busy trainer during updateAppointment → expect overlap error. |
| TC-P2-003 | test-coverage | Phase 2.11 concurrent materialization test requires unique constraint (Phase 0 task 6) to be applied first — hard ordering dependency. |

---

## New MEDIUM Findings (Pass 2)

| ID | Source | Finding |
|----|--------|---------|
| AS-P2-001 | api-surface | Phase 2.6 overloads `appointments.update` with `cancelAll` / `cancelFutureFrom` — inconsistent with the separate-procedure pattern used in Phase 2.4 and 2.5. Recommend `appointments.cancelSeries` and `appointments.cancelFuture` as dedicated procedures. |
| SD-P2-002 | schema-drift | "year" timeUnit in RepeatRuleSection UI but NOT in planned backend enum (`'day'|'week'|'month'`). Will cause Zod validation error if user selects "year". Must resolve: add to backend or remove from UI. |
| TS-P2-002 | type-safety | "year" timeUnit conflict between UI and backend Zod enum (mirrors SD-P2-002). |
| DC-P2-001 | doc-consistency | Phase 2.6 overloaded update contradicts separation-of-concerns in Phase 2.4/2.5. |
| TC-P2-002 | test-coverage | No test for "year" timeUnit exclusion/inclusion. |
| TC-P2-004 | test-coverage | No test verifying `package_management` permissions seeded in tenant DB. |

---

## New LOW Findings (Pass 2)

| ID | Source | Finding |
|----|--------|---------|
| DC-P2-002 | doc-consistency | Section 9 estimates do not include Phase 2.0 (0.5 day). |
| DC-P2-003 | doc-consistency | META.md pre-implementation checks not updated with verification results. |
| DC-P2-004 | doc-consistency | Possible remaining `virtual:` reference in plan (check after Pass 2 edits). |
| TS-P2-003 | type-safety | `OccurrenceEditAction` type in plan comments only, not in source (expected). |
| SC-P2-001 | scalability | EXCLUDE constraint recheck on trainerId UPDATE — O(log N), acceptable, `mapPgError` already handles 23P01 in create path; verify same handler covers update path. |

---

## Auto-Fixable in Pass 2 (to apply to plan.md)

1. Phase 1.1 pseudocode: add trainerId update step when slot 0 changes in staffAssignments
2. Phase 2.3: add explicit `WHERE recurringParentId IS NULL` filter note
3. Phase 2.6: change to dedicated `cancelSeries` / `cancelFuture` procedures (or annotate as HIGH RISK)
4. Phase 2.7: resolve "year" timeUnit conflict (recommend: disable year in UI for MVP)
5. Phase 2.9: update `cancel_all` → `cancelSeries`, `cancel_future` → `cancelFuture`
6. Phase 1.2: add note about seeding `package_management` in permissions table
7. Phase 2.11: add DAYS adapter mapping unit test
8. Section 9: add Phase 2.0 row to estimates table
9. META.md: mark first two pre-implementation checks as verified

---

## Pass 2 Total Counts (new findings only)

- CRITICAL: 1
- HIGH: 5
- MEDIUM: 6
- LOW: 5
- **New total: 17**

## Combined Total (Pass 1 + Pass 2)

- CRITICAL: 5 (4 from P1 + 1 from P2)
- HIGH: 17 (12 from P1 + 5 from P2)
- MEDIUM: 16 (10 from P1 + 6 from P2)
- LOW: 13 (8 from P1 + 5 from P2)
- **Grand total: 51 unique findings**
