# Test Coverage Audit — Pass 1

**Auditor:** test-coverage-auditor
**Date:** 2026-05-07

## Acceptance Criteria → Test Mapping

### Phase 1 — Category Booking Rules Display

| Acceptance Criterion | Plan Test | Status |
|---|---|---|
| Open category with rules → all 5 fields render | Manual frontend | Covered (manual) |
| Open category with no config row → "Not yet configured" | Manual frontend | Covered (manual) |
| Edit rules → save → re-open detail dialog → updated values | Manual frontend | Covered (manual) |
| Cache invalidation fires after `upsert` | No test | MISSING |

**Gap:** No automated test verifies that `serviceCategoryConfig.getByCategoryId.key()` is invalidated after `upsert`. This is a frontend cache behavior — hard to unit test, but should be mentioned.

### Phase 2 — Trainer-to-Service Assignment Admin UI

| Acceptance Criterion | Plan Test | Status |
|---|---|---|
| `listForService` returns correct trainers with displayName | Integration test proposed | PROPOSED |
| `listForService` permission denied without service_management:read | Integration test proposed | PROPOSED |
| Admin assigns trainer → list updates (no page reload) | Manual frontend | Covered (manual) |
| Admin removes trainer → list updates | Manual frontend | Covered (manual) |
| `listForService` returns empty array for service with no assignments | NOT in proposed tests | MISSING |
| `listForService` fallback to `memberId` when no memberProfile exists | NOT in proposed tests | MISSING — HIGH |

### Phase 3 — Appointment Form Trainer Filter

| Acceptance Criterion | Plan Test | Status |
|---|---|---|
| No service selected → full trainer list, no caption | Manual frontend | Covered (manual) |
| Service selected with assignments → narrowed list + caption | Manual frontend | Covered (manual) |
| Service with no assignments → full list + amber caption | Manual frontend | Covered (manual) |
| Change service, prev trainer not qualified → trainer resets | Manual frontend | Covered (manual) |
| Appointment creation completes successfully | Manual frontend | Covered (manual) |
| **Trainer filter logic (derivedTrainers derivation)** | No unit test | **MISSING — HIGH** |

## HIGH Findings

### H1 — HIGH: Trainer-filter derivation logic is untested

The `derivedTrainers` derivation in `useAppointmentFormState` is a pure data transformation:
```typescript
const derivedTrainers = firstServiceId && serviceAssignments.length > 0
  ? trainers.filter((t) => qualifiedTrainerIds.includes(t.id))
  : trainers;
```

This is the critical business rule of Phase 3. It has:
- 3 branches (no service, service with assignments, service without assignments)
- A dependency on `qualifiedTrainerIds` computed from `serviceAssignments`
- A side effect of clearing `assignedTo` when trainer is disqualified (Task 3.4)

**No unit test exists or is proposed for this logic.** The plan's test section mentions only manual frontend verification. An integration test or unit test for the hook derivation is needed.

**Recommendation:** Add a unit test file `apps/server/src/tests/unit/service-members-filter.test.ts` OR a frontend hook test at `apps/web/src/__tests__/hooks/useAppointmentFormState.test.ts` covering:
1. `firstServiceId = null` → `derivedTrainers = trainers` (no filter)
2. `firstServiceId` set, `serviceAssignments.length > 0` → `derivedTrainers` is filtered subset
3. `firstServiceId` set, `serviceAssignments.length === 0` → `derivedTrainers = trainers` (fallback)
4. Trainer clearing effect: if `assignedTo` is not in `qualifiedTrainerIds`, it gets reset

### H2 — HIGH: `listForService` with no matching memberProfile

The `listForService` procedure uses a `leftJoin` on `memberProfiles`. The fallback `displayName ?? r.memberId` means if no profile exists, the UUID is shown. The proposed integration test only verifies the happy path (2 trainers returned with correct `displayName`). 

**Recommendation:** Add a test case: assign trainer with no memberProfile entry → assert `displayName` equals the `memberId` UUID string.

## MEDIUM Findings

### M1 — MEDIUM: No test for the `useEffect` trainer-clearing (Task 3.4)

The `useEffect` that clears `assignedTo` when service changes is side-effect logic inside a React hook. It is only manually testable in the current plan. This is medium risk because:
- The effect depends on `firstServiceId`, `trainerFilterActive`, `qualifiedTrainerIds`
- A stale closure could result in the effect not firing

### M2 — MEDIUM: No regression test for existing trainer dropdown behavior

When no service is selected, the trainer dropdown must show the full list. The plan adds a conditional query but the existing `useAppointmentFormData` trainer query is unchanged. No test verifies the fallback path doesn't break existing form behavior.

## LOW Findings

### L1 — LOW: Integration test file name inconsistency
The plan proposes file: `apps/server/src/tests/integration/service-members-list-for-service.test.ts`. The existing integration test naming convention uses descriptive names like `members.test.ts`, `members-deactivate.integration.test.ts`. The proposed name is fine but slightly inconsistent — `service-members.integration.test.ts` would match better.

## Summary

| ID | Severity | Finding |
|---|---|---|
| H1 | HIGH | No unit/integration test for `derivedTrainers` logic in Phase 3 |
| H2 | HIGH | No test for `listForService` with missing memberProfile (UUID fallback) |
| M1 | MEDIUM | No test for trainer-clearing `useEffect` (Task 3.4) |
| M2 | MEDIUM | No regression test for existing trainer dropdown behavior |
| L1 | LOW | Integration test file name convention |
