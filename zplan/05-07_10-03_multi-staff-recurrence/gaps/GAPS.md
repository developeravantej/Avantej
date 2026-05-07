# Pass 1 — Gap Synthesis

**Date:** 2026-05-07  
**Auditors:** schema-drift, api-surface, test-coverage, doc-consistency, type-safety, scalability

---

## CRITICAL Findings (must fix before implementation)

| ID | Source | Finding |
|----|--------|---------|
| AS-001 | api-surface | `staffAssignments[].staffId` in router is validated as UUID but the form sends `members.id` (tenant UUID) not `members.userId` (control-panel UUID). Commission calculator silently skips the member. Both are UUID-shaped so Zod cannot catch this. |
| AS-007 | api-surface | `package_management` permission resource does NOT exist in `permission.service.ts` Resource union. The new `packageInstanceStaff` router cannot call `requirePermission(..., "package_management", ...)` without TypeScript error. |
| TS-001 | type-safety | `TrainerRow` type has no `userId` field — the bug at AS-001 is invisible at type level because both IDs are `string`. |
| TC-003 | test-coverage | No test verifies 2 actual staff members → 2 commission splits with correct distribution. This is the core value proposition of multi-staff and is untested. |

---

## HIGH Findings (must fix before shipping)

| ID | Source | Finding |
|----|--------|---------|
| SD-004 | schema-drift | No unique constraint on `(recurringParentId, startTime)` on appointments. Concurrent "Edit this occurrence" creates duplicate child rows. Plan acknowledges as Q2 MEDIUM — should be HIGH. |
| AS-003 | api-surface | `checkAppointmentBufferConflict` checks `appointments.trainerId`, not `appointment_staff` rows. Multi-staff members at slot >0 are NOT conflict-checked by the current implementation — the loop in Phase 1.1 is incomplete unless the buffer check is also changed or a new multi-staff variant is created. |
| AS-004 | api-surface | `updateAppointment` has no `staffAssignments` param (confirmed expected gap). |
| AS-005 | api-surface | `packageInstanceStaff` router and service entirely absent (confirmed expected gap). |
| DC-001 | doc-consistency | Phase 1.3/2.7 target `add-appointment-modal.tsx` but actual changes must go to `useAppointmentFormState.ts`, `useAppointmentFormData.ts`, and `StaffPicker.tsx`. Shell file needs no changes. |
| DC-006 | doc-consistency | Phase 2.3 does not address how `listAppointmentsWithRecurrence` integrates with existing name-enrichment logic in `appointments.list` router. |
| DC-007 | doc-consistency | No `timezone` field in org settings schema. Phase 2.1 expansion engine has an unresolved dependency: cannot use tenant timezone that doesn't exist. Needs a decision: add timezone to org settings (new migration), default to UTC, or accept from API input. |
| DC-010 | doc-consistency | `package-instances.ts` already inserts slot 0 into `package_instance_staff` during approval. New `assign` procedure will conflict on `UNIQUE(packageInstanceId, slotIndex)` if slot 0 already exists. |
| SC-003 | scalability | No index on `appointments.isRecurring`. Phase 2.3 list query will do a heap filter. |
| SC-004 | scalability | Concurrent materialization race unmitigated (mirrors SD-004). |
| TS-003 | type-safety | `CustomRecurrence` frontend type does not match backend `RecurrenceParams`: field name mismatches (`frequency` vs `frequencyValue`, `repeatOn: string[]` vs `number[]`, `endsDate` vs `endsOn`, `endsOccurrences` vs `endsAfterOccurrences`), and `endsType` values ("on"/"after" vs "on_date"/"after_occurrences"). |
| TC-010 | test-coverage | No test for buffer-time multi-staff loop (first trainer no conflict, second has conflict → whole create fails). |
| TC-011 | test-coverage | No test for `resolveMemberIdFromUserId` helper (valid userId → id, unknown → null). |
| TC-012 | test-coverage | No frontend unit test for the staffId convention (form sends userId not member.id). |

---

## MEDIUM Findings (address in same phase)

| ID | Source | Finding |
|----|--------|---------|
| SD-001 | schema-drift | `appointment_staff.slotIndex` is nullable in DB. Commission calculator behavior on null slotIndex is undefined. Plan implies it is required. |
| SD-003 | schema-drift | `package_instance_staff` uses `assignedAt` column, not `createdAt` as plan states. |
| AS-009 | api-surface | `appointments.list` trainerId filter uses `members.id` — if any future caller passes `members.userId`, silently returns no results. |
| DC-005 | doc-consistency | Phase 2.3 `list` must exclude materialized child rows from base query. Current `listAppointments` does not filter on `recurringParentId IS NULL`. |
| TS-004 | type-safety | Edit semantics ("this/all/future") not formally typed — suggest `OccurrenceEditAction` discriminated union. |
| TS-005 | type-safety | Synthetic occurrence ID format `{parentId}:{isoDate}` is unsafe — ISO dates contain `:`. Need a safe delimiter or structured type. |
| TS-006 | type-safety | `RecurrenceRule` type for `expandRecurrenceRule` not defined in plan — should be `typeof recurrenceRules.$inferSelect`. |
| SC-001 | scalability | No cap on virtual occurrence count per window. Add a per-series safety cap inside `expandRecurrenceRule`. |
| SC-002 | scalability | Buffer-time loop: N sequential round-trips. Add max staff count cap at router level. |
| TC-005 | test-coverage | Phase 2.11 DST unit test is blocked by unresolved timezone dependency (DC-007). |

---

## LOW Findings (nice to fix)

| ID | Source | Finding |
|----|--------|---------|
| SD-002 | schema-drift | `recurrence_rules` timestamps lack `{ withTimezone: true }`. Minor consistency issue. |
| AS-006 | api-surface | Recurrence procedures (materializeOccurrence, splitSeries) absent — confirmed expected gap. |
| DC-003 | doc-consistency | Phase 1.4 should definitively state `EditAppointmentModal` will be created (not "possibly"). |
| DC-009 | doc-consistency | Phase 0 test vs Phase 1.6 test distinction could be clearer. |
| TS-007 | type-safety | `AppointmentWithOccurrence` base `Appointment` type undefined — should be `typeof appointments.$inferSelect`. |
| TS-008/009 | type-safety | `timeUnit` and `endsType` DB columns are unconstrained text — Zod enums in router are sufficient mitigation. |
| SC-007 | scalability | splitSeries bulk UPDATE for large materialized series — low risk for MVP. |
| TC-004 | test-coverage | No test for UNIQUE constraint enforcement in packageInstanceStaff (same staffId twice). |

---

## Auto-Fixable in Pass 1 (applied to plan.md)

1. Correct `package_instance_staff.createdAt` → `assignedAt` in section 3.1 schema description
2. Mark `(recurringParentId, startTime)` unique constraint as required (Phase 0 or Phase 2 pre-work), elevated from MEDIUM to HIGH risk
3. Add `package_management` permission resource to Phase 1.2 task list
4. Correct Phase 1.3/2.7 file targets to include `useAppointmentFormState.ts`, `useAppointmentFormData.ts`, `StaffPicker.tsx`
5. Add buffer-time multi-staff test to Phase 1.6
6. Add `resolveMemberIdFromUserId` unit test to Phase 0
7. Add isRecurring index to Phase 2 schema changes
8. Add timezone resolution decision as a blocking dependency in Phase 2.1
9. Clarify synthetic ID format (use `virtual__` prefix)
10. Add `package_management` resource to permission.service.ts in Phase 1.2 tasks
11. Note `package-instances.ts` slot-0 conflict for `packageInstanceStaff.assign`
12. Add `TrainerRow.userId` to Phase 1.3 data layer changes

---

## Counts

- CRITICAL: 4
- HIGH: 12
- MEDIUM: 10
- LOW: 8
- **Total unique findings: 34**
