# Documentation Consistency Audit

## Summary

Most file paths in the plan exist. Key issues: (1) `add-appointment-modal.tsx` is a thin shell — the actual form logic is in `appointment-form/` subdirectory and `useAppointmentFormState.ts` hook; plan describes changes to the shell file but actual changes must go to the hook and sub-components. (2) Several line number claims need correction. (3) Phase dependency ordering has one issue.

---

## Findings

### DC-001 — `add-appointment-modal.tsx` is a thin shell; plan's Phase 1.3/2.7 changes target wrong layer
**Severity: HIGH**

Plan Phase 1.3: "File: `apps/web/src/components/calendar/add-appointment-modal.tsx`"
Plan Phase 2.7: "File: `apps/web/src/components/calendar/add-appointment-modal.tsx`"

Actual: `add-appointment-modal.tsx` is 55 lines. It is a thin wrapper that delegates to:
- `useAppointmentFormState` hook for all state/logic
- `AppointmentFormContent` component (in `appointment-form/AppointmentFormContent.tsx`) for all JSX
- `StaffPicker` component (`appointment-form/StaffPicker.tsx`) — already exists and renders multi-slot pickers

The real changes for Phase 1.3 must go to:
- `apps/web/src/hooks/useAppointmentFormState.ts` — staffId convention fix (line 694: `staffId: newAppointment.employeeId` should use `userId` not `id`)
- `apps/web/src/hooks/useAppointmentFormData.ts` — `TrainerRow` type must expose `userId`
- `apps/web/src/components/calendar/appointment-form/StaffPicker.tsx` — may need `userId` propagation

The `StaffPicker` component already handles multi-slot commission-driven pickers. The core bug (AS-001) is in `useAppointmentFormData.ts` where `TrainerRow.id = m.id` instead of `m.userId`.

**Plan should be updated to reference these files in Phase 1.3.**

---

### DC-002 — `commission-calculator.service.ts` line 399 claim VERIFIED ACCURATE
**Severity: INFORMATIONAL**

Grep confirms `eq(members.userId, assignment.staffId)` appears at line 399 of `packages/services/src/commission-calculator.service.ts`. Claim is accurate.

---

### DC-003 — Phase 1.4 references `appointment.tsx` for edit modal — component exists but is a full calendar
**Severity: MEDIUM**

Plan Phase 1.4: "File: `apps/web/src/components/calendar/appointment.tsx` (and possibly new `edit-appointment-modal.tsx`)"

Actual: `appointment.tsx` is a large calendar component (AppointmentCalendar). It has `toast.info` on appointment click. It does NOT have an edit modal. Adding staff slot list requires creating a new `EditAppointmentModal` component or extending the existing click handler.

Plan language "possibly new `edit-appointment-modal.tsx`" is correct — it should be stated as definite since the shell file has no edit functionality.

---

### DC-004 — Phase 0 file list omits `packages/services/src/buffer-time.service.ts`
**Severity: LOW**

Phase 0 task: "Write `resolveMemberIdFromUserId` helper in `appointment.service.ts`"
Files listed: only `appointments.ts` and `appointment.service.ts`.

The buffer-time loop (Phase 1.1) requires calling `resolveMemberIdFromUserId` and then passing result to `checkAppointmentBufferConflict`. The buffer-time service itself (`buffer-time.service.ts`) does not need changes, but Phase 1.1 files list should clarify the buffer-time service is read-only.

---

### DC-005 — Phase 1.2 says "register: packages/api/src/routers/index.ts — add packageInstanceStaff: packageInstanceStaffRouter"
**Severity: LOW (path confirmed)**

`packages/api/src/routers/index.ts` confirmed to exist. The registration pattern matches existing routers. Path is correct.

---

### DC-006 — Phase 2.3 says "Replace direct DB query with listAppointmentsWithRecurrence" — appointments.list already has enrichment logic
**Severity: MEDIUM**

The `appointments.list` procedure (lines ~90-190 in router) does substantial post-query enrichment: batch-resolves service names, trainer names (via dual members.id/userId lookup), client names. `listAppointmentsWithRecurrence` will need to either:
1. Return raw appointment rows and let the router do its existing enrichment, or
2. Include enrichment internally

The plan does not address this integration. Option 1 is safer but requires `listAppointmentsWithRecurrence` to accept and pass through the existing query parameters. Plan should clarify this interface.

---

### DC-007 — Phase 2 dependency: recurrence timezone source is unresolved
**Severity: HIGH**

Plan section 7 (Timezone): "Use tenant timezone from org settings. Thread it into listAppointmentsWithRecurrence."

Grep of `packages/db/src/schema/` finds NO timezone column in organization settings. The `organization_settings` table does not appear to have a `timezone` field.

This is a blocking dependency for Phase 2.1 (`expandRecurrenceRule` must operate in tenant timezone). If the timezone field does not exist in DB, it cannot be fetched. Either:
1. Add `timezone` column to org settings schema — requires a NEW migration
2. Default to UTC and document the limitation
3. Accept timezone from the API input params

The plan assumes option 1 exists but it does NOT. This needs to be resolved before Phase 2.1.

---

### DC-008 — META.md source research: "appointment-staff.ts" file listed as `packages/db/src/schema/tenant/appointment-staff.ts`
**Severity: LOW (confirmed)**

File confirmed to exist at exactly that path. 

---

### DC-009 — Phase 1.6 test for "staffId convention" regression guard placed in Phase 0
**Severity: LOW**

Plan Phase 0 task 4: "Write integration test asserting commission calculator receives members.userId not members.id (regression guard for Phase 1)."
Plan Phase 1.6 also lists commission calculator test with 2 staff.

These are different tests. The Phase 0 test should specifically test the WRONG value scenario. Phase 1.6 test tests the correct multi-staff scenario. Both should remain in the plan. No conflict but could be clearer that they are separate tests.

---

### DC-010 — `packages/api/src/routers/package-instances.ts` already inserts into `package_instance_staff`
**Severity: MEDIUM**

During package instance approval (package-instances.ts line 681), a `package_instance_staff` row is inserted for the primary trainer. This is the ONLY existing write path.

Phase 1.2 plan creates a new `packageInstanceStaff` router. The plan does not mention coordinating with the existing insert in `package-instances.ts`. If the approval flow inserts into slot 0 and the new `assign` procedure also targets slot 0, the unique constraint `UNIQUE(packageInstanceId, slotIndex)` will cause a conflict.

**Fix required in Phase 1.2:** The `packageInstanceStaff.assign` procedure must handle the case where slot 0 already exists (from approval flow): either UPSERT or return a 409.

---

## Phase Dependency Check

| Dependency | Status |
|------------|--------|
| Phase 0 before Phase 1 | Correct |
| Phase 1.1 (backend) before Phase 1.3 (frontend) | Correct |
| Phase 1.2 before Phase 1.5 | Correct |
| Phase 2 after Phase 1 | Correct (stated as independent, but recurrence expansion depends on appointment create being stable) |
| Phase 2.1 expansion engine before Phase 2.2 create | Correct |
| Phase 2.3 list before Phase 2.4 materialize | Correct |
| Timezone field existence before Phase 2.1 | MISSING DEPENDENCY — timezone field does not exist |
| Unique constraint `(recurringParentId, startTime)` before Phase 2.4 | MISSING DEPENDENCY — must add to schema before materializeOccurrence |
