# API Surface Audit

## Summary

Key findings: (1) commission calculator line 399 claim is VERIFIED ACCURATE. (2) `staffAssignments[].staffId` in the CREATE procedure is validated as `z.string().uuid()` — this BLOCKS non-UUID `members.userId` values and is a **CRITICAL** bug. (3) `updateAppointment` lacks `staffAssignments` parameter — plan correctly identifies this. (4) `packageInstanceStaff` router/service are entirely unbuilt. (5) Recurrence procedures (materializeOccurrence, splitSeries) do not yet exist.

---

## Findings

### AS-001 — CRITICAL: `staffAssignments[].staffId` validated as UUID in router, but must be `members.userId` (text)
**Severity: CRITICAL**

In `packages/api/src/routers/appointments.ts` `create` procedure (line 308):
```typescript
staffAssignments: z.array(z.object({
  staffId: z.string().uuid(),   // ← z.string().uuid() blocks non-UUID userIds
  slotIndex: z.number().int().min(0),
})).optional(),
```

`members.userId` is a Better-Auth user ID which is a UUID-formatted string — so in practice it IS UUID-shaped and `z.string().uuid()` will pass validation. HOWEVER: the plan's concern is that the form currently passes `member.id` (tenant DB UUID) not `member.userId` (control-panel UUID). Both are UUID-shaped, so the validation does NOT catch the wrong ID being passed. The validator cannot distinguish between the two.

**Real problem:** `StaffPicker` passes `trainers[i].id` (= `member.id`, tenant DB UUID) via `employeeId`/`additionalSlotTrainers` state, and the form hook puts those into `staffAssignments[].staffId`. Since `TrainerRow.id = m.id` (see `useAppointmentFormData.ts` line 134: `id: m.id`), the form is currently sending `members.id` not `members.userId` as `staffId`.

Commission calculator line 399: `eq(members.userId, assignment.staffId)` — this will SILENTLY FAIL to find the member because a tenant `members.id` UUID will not match `members.userId` control-panel UUID.

**Fix required in Phase 1.3:** Change `TrainerRow.id` to store `userId` OR add a `userId` field to `TrainerRow` and use it for `staffAssignments[].staffId`. The `StaffPicker` component uses trainer `id` as Select value, so the whole trainer picker needs to emit `userId` for `staffAssignments` while keeping `member.id` for the `trainerId` field.

---

### AS-002 — Commission calculator line 399 claim: VERIFIED ACCURATE
**Severity: INFORMATIONAL**

`packages/services/src/commission-calculator.service.ts` line 399:
```typescript
.where(eq(members.userId, assignment.staffId))
```
Confirmed. `assignment.staffId` must be `members.userId`. This matches the plan's claim exactly.

---

### AS-003 — `checkAppointmentBufferConflict` uses `appointments.trainerId` (members.id UUID), NOT appointment_staff
**Severity: HIGH**

Buffer time service `checkAppointmentBufferConflict` (buffer-time.service.ts line 90):
```typescript
eq(appointments.trainerId, params.trainerId),
```
It queries `appointments.trainerId` which is `members.id` UUID FK.

Plan section 3.5 says:
> "Note: `checkAppointmentBufferConflict` takes `members.id` (UUID). staffAssignments carry `members.userId`. Requires a `resolveMemberIdFromUserId` helper."

This is accurately described in the plan. HOWEVER: the `resolveMemberIdFromUserId` helper does NOT yet exist — confirmed by grep returning zero matches. This helper must be created in Phase 0.

Additionally: the buffer-time check only checks `appointments.trainerId`. Multi-staff members assigned via `appointment_staff` but NOT in `appointments.trainerId` (slot > 0) will NOT be conflict-checked by the current implementation. This is a real gap for the multi-staff buffer check loop described in Phase 3.5.

---

### AS-004 — `updateAppointment` has NO `staffAssignments` parameter (confirmed gap)
**Severity: HIGH** (expected gap, plan correctly identifies it)

`packages/services/src/appointment.service.ts` `UpdateAppointmentParams` type (lines 93-107):
```typescript
export type UpdateAppointmentParams = {
  status?: string;
  startTime?: Date;
  ...
  actor?: { ... };
  // NO staffAssignments
};
```

`packages/api/src/routers/appointments.ts` update procedure: confirmed no `staffAssignments` in input schema.

This is correctly identified as Phase 1.1 work.

---

### AS-005 — `packageInstanceStaff` router and service: ENTIRELY ABSENT
**Severity: HIGH** (expected gap, plan correctly identifies it)

Confirmed: no `package-instance-staff.ts` in either `packages/services/src/` or `packages/api/src/routers/`.
`packages/api/src/routers/index.ts` has no `packageInstanceStaff` entry.

The only existing reference is in `packages/api/src/routers/package-instances.ts` which inserts into `packageInstanceStaff` table during package approval (line 681). This is a write that exists but no CRUD API is exposed.

---

### AS-006 — Recurrence procedures: ABSENT
**Severity: HIGH** (expected gap, plan correctly identifies it)

Confirmed absent:
- `appointments.materializeOccurrence` — not in router
- `appointments.splitSeries` — not in router
- `recurrence.service.ts` — file does not exist
- `listAppointmentsWithRecurrence` — not in service

No `recurrence` param in `appointments.create` router input.

---

### AS-007 — `package_management` permission resource does NOT exist in `permission.service.ts`
**Severity: CRITICAL**

Plan section 7 (Permissions):
```
| List package instance staff | `package_management:read` |
| Manage package instance staff | `package_management:write` |
```

`packages/services/src/permission.service.ts` `Resource` union type does NOT include `"package_management"`. The resource does not exist at all.

Existing package-related resources: none. The closest are `pos`, `sales`, `inventory`.

**Fix required in Phase 1.2:** Add `"package_management"` to the `Resource` union type in `permission.service.ts` before the new router can use it. Otherwise `requirePermission(tenantDb, member, "package_management", "read")` will TypeScript error (and may also silently fail at runtime depending on how the DB lookup handles unknown resources).

---

### AS-008 — `members.list` router returns `userId` — CONFIRMED
**Severity: INFORMATIONAL (Open Question Q1 resolved)**

`packages/api/src/routers/members.ts` returns `userId: member.userId` in list results (line 131). `useAppointmentFormData.ts` types it as `MemberListItem.userId: string`. The data is available.

The problem is that `TrainerRow` maps `id: m.id` (not `userId`), so the downstream picker sends the wrong field. See AS-001.

---

### AS-009 — `trainerId` filter in `appointments.list` uses `z.string().uuid()` — trainer filter by userId will fail
**Severity: MEDIUM**

`appointments.list` input `trainerId: z.string().uuid().optional()` is passed to `listAppointments(tenantDb, { trainerId: input.trainerId })`, which runs `eq(appointments.trainerId, params.trainerId)` — comparing against `appointments.trainerId` which is `members.id`. This is correct behavior for the list filter. However, if any caller tries to filter by `members.userId` instead of `members.id`, it will silently return no results. No plan change needed, but implementers should be aware.
