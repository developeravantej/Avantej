# GAPS — Pass 2 Synthesis

**Session:** 05-07_10-04_service-config
**Date:** 2026-05-07 (Pass 2)

---

## Finding Inventory

| ID | Domain | Severity | Title |
|---|---|---|---|
| **P2-API1** | API Surface | **MEDIUM** | Task 1.3 uses wrong invalidation pattern — must use `useApiMutation`'s `invalidate` array, not manual `qc.invalidateQueries` |
| **P2-TS1** | Type Safety | **MEDIUM** | `useQueryClient()` placed after `useQuery` calls in TrainersTab — should be at component top |
| **P2-TS4** | Type Safety | **MEDIUM** | `derivedTrainers` type in `AppointmentFormContentProps` needs explicit type or `TrainerRow` import specified |
| **P2-DC1** | Doc Consistency | **MEDIUM** | Section 3 pseudocode shows stale `members.userId` join not in actual implementation |
| **P2-TC1** | Test Coverage | **MEDIUM** | Test D (scheduler permission) needs context setup documentation |
| **P2-API4** | API Surface | **MEDIUM** | Task 2.2 missing complete import list for TrainersTab dependencies |
| **P2-TS5** | Type Safety | **LOW** | `trainerFilterFallback` flickers during loading — add `isLoadingAssignments` guard |
| **P2-DC2** | Doc Consistency | **LOW** | Unused `refetch` in TrainersTab destructure |
| **P2-DC3** | Doc Consistency | **LOW** | File Change Summary missing import note |
| **P2-API2** | API Surface | **LOW** | Stale `members.userId` comment in Section 3 overview snippet |
| **P2-SC1** | Scalability | **LOW** | TrainersTab trainer cache key differs from useAppointmentFormData |
| **P2-TC2** | Test Coverage | **LOW** | Hook tests need QueryClientProvider mocking setup |
| **P2-SC3** | Scalability | **LOW** | Broad invalidation is intentionally correct |

---

## Auto-Fixable in plan.md (Pass 2)

1. **P2-API1:** Fix Task 1.3 to show `useApiMutation`'s `invalidate` array pattern
2. **P2-TS1:** Move `useQueryClient()` before `useQuery` calls in TrainersTab spec
3. **P2-DC1:** Fix Section 3 pseudocode comment
4. **P2-DC2:** Remove `refetch` from TrainersTab destructure
5. **P2-TS5:** Add `isLoadingAssignments` guard to `trainerFilterFallback`
6. **P2-API4:** Add complete import list to Task 2.2

---

## Counts

- MEDIUM: 6
- LOW: 7
- **Total new findings:** 13
