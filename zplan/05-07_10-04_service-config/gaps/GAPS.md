# GAPS — Pass 1 Synthesis

**Session:** 05-07_10-04_service-config
**Date:** 2026-05-07
**Auditors:** 6 parallel domain specialists

---

## Finding Inventory

| ID | Domain | Severity | Title |
|---|---|---|---|
| **DC2** | Doc Consistency | **CRITICAL** | Phase 1 Task 1.1 already implemented — booking rules panel exists in current codebase |
| **H1** | Test Coverage | **HIGH** | No unit/integration test for `derivedTrainers` filter logic (Phase 3) |
| **H2** | Test Coverage | **HIGH** | No test for `listForService` with missing memberProfile (UUID fallback) |
| **TS1** | Type Safety | **MEDIUM** | `AppointmentFormContentProps` must be manually updated (not inferred from hook) |
| **TS3** | Type Safety | **MEDIUM** | `TrainersTab` missing `useQueryClient()` call — runtime error if omitted |
| **DC4** | Doc Consistency | **MEDIUM** | Phase 3 dependency on Phase 2 procedure needs explicit callout |
| **M1** | Test Coverage | **MEDIUM** | No test for trainer-clearing `useEffect` (Task 3.4) |
| **M2** | Test Coverage | **MEDIUM** | No regression test for existing trainer dropdown behavior |
| **F5** | API Surface | **LOW** | `m.displayName` dead code in unassigned picker label (`members.list` has no `displayName`) |
| **DC1** | Doc Consistency | **LOW** | `members` import unnecessary in Task 2.1 |
| **DC3** | Doc Consistency | **LOW** | META.md lists wrong hook file (`useAppointmentFormData` instead of `useAppointmentFormState`) |
| **TS2** | Type Safety | **LOW** | `qualifiedTrainerIds` needs `useMemo` to prevent effect re-fires |
| **SC1** | Scalability | **LOW** | Consider Combobox (searchable) for assign trainer picker |
| **L1** | Test Coverage | **LOW** | Integration test filename convention |

---

## Critical Finding

### DC2 — CRITICAL: Phase 1 is already done

Inspecting `service-category-detail-dialog.tsx` reveals the booking rules display is **fully implemented**:
- Lines 233–267 render "Timing" and "Booking & Cancellation Rules" sections
- The `useEffect` already calls `client.serviceCategoryConfig.getByCategoryId` in a `Promise.all`
- The `config` state is already populated and rendered

**Impact:** Phase 1, Task 1.1 is DONE. The plan should be updated to mark this as complete and direct implementors to start at Task 1.3 (cache invalidation — the only real gap in Phase 1).

---

## Auto-Fixable in plan.md

The following will be applied to `plan.md`:

1. **DC2:** Add a "DONE" annotation to Phase 1 Task 1.1 — note that the booking rules panel is already implemented.
2. **TS3:** Add `const qc = useQueryClient();` to the `TrainersTab` code snippet.
3. **DC1:** Remove `members` import from Task 2.1 import list (only `memberProfiles` is needed).
4. **F5:** Fix `m.displayName ??` → drop `displayName` from the unassigned picker label expression.
5. **TS1:** Add explicit note to Task 3.2 about manually updating `AppointmentFormContentProps`.
6. **DC4:** Add explicit note that Phase 3 depends on Phase 2 Task 2.1 completing first.
7. **H1:** Add test cases to testing plan for `derivedTrainers` logic.
8. **H2:** Add test case for `listForService` with missing memberProfile.

---

## Counts

- CRITICAL: 1
- HIGH: 2
- MEDIUM: 4
- LOW: 7
- **Total:** 14
