# Phase 1 Execution Summary — Multi-Staff Appointments

**Date:** 2026-05-07  
**Branch:** feat/package-approval-flow  
**Type check result:** PASS (no new errors introduced; all pre-existing errors in scripts and Plan E code unchanged)

---

## Tasks Completed

### Task 1.1 — Add `userId` to `TrainerRow`
**File:** `apps/web/src/hooks/useAppointmentFormData.ts`
- Added `userId: string` field to `TrainerRow` type
- Populated from `m.userId` in trainer mapping (line 135)

### Task 1.2 — Service layer: `staffAssignments` in `updateAppointment`
**File:** `packages/services/src/appointment.service.ts`
- Widened `resolveMemberIdFromUserId` first param from `TenantDb` to `TenantDb | TenantTx`
- Added `staffAssignments?: { staffId: string; slotIndex: number }[]` to `UpdateAppointmentParams`
- Buffer check loop: when `staffAssignments` provided, resolves each userId → memberId and runs `checkAppointmentBufferConflict` for each; fires even if time unchanged (catches new-staff-only updates)
- Inside tx (B.1.6): DELETE + INSERT all `appointmentStaff` rows; syncs slot-0 staffId → `appointments.trainerId` via `resolveMemberIdFromUserId(tx, ...)`; clears `trainerId` when all staff removed

### Task 1.3 — Fix `staffAssignments` userId translation in submit handler
**File:** `apps/web/src/hooks/useAppointmentFormState.ts`
- Added `findUserId(membersId)` helper that looks up `TrainerRow.userId` from `derivedTrainers` + `trainers`
- Fixed slot-0: `newAppointment.employeeId` (was `members.id`) → now translates to `members.userId`
- Fixed additional slots: `additionalSlotTrainers[i]` (was `members.id`) → now translates to `members.userId`
- Both use `findUserId`; slots with no userId match are silently dropped (safe fallback)

### Task 1.4 — Router: `staffAssignments` in `update` procedure
**File:** `packages/api/src/routers/appointments.ts`
- Added `staffAssignments: z.array(z.object({ staffId: z.string().uuid(), slotIndex: z.number().int().min(0) })).optional()` to `update` input schema
- Added client guard: clients cannot pass `staffAssignments` (throws FORBIDDEN)
- Added `staffAssignments: input.staffAssignments` to `updateParams` passed to `updateAppointment`

### Task 1.5 — Permission seed: `package_management`
**File:** `packages/db/src/seed-rbac.ts`
- Added 4 rows: `package_management:{read,create,update,delete}` to `defaultPermissions` array
- Admin gets all via `*` mapping; other roles not assigned (admin-only by default)
- Note: `package_management` was already in `permission.service.ts` Resource union — no change needed there

### Task 1.6 — Package instance staff service
**File:** `packages/services/src/package-instance-staff.service.ts` (NEW)
- `listPackageInstanceStaff(tenantDb, packageInstanceId)` — ordered by slotIndex
- `assignPackageInstanceStaff(tenantDb, params)` — UPSERT on (packageInstanceId, slotIndex); handles slot-0 approval-flow pre-insert
- `removePackageInstanceStaff(tenantDb, packageInstanceId, staffId)` — delete by (packageInstanceId, staffId)
- `replacePackageInstanceStaff(tenantDb, params)` — atomic DELETE + INSERT in tx; guards empty array

**File:** `packages/services/src/index.ts`
- Added named exports for all 4 functions + 3 types

### Task 1.7 — Package instance staff router
**File:** `packages/api/src/routers/package-instance-staff.ts` (NEW)
- `list`, `assign`, `remove`, `replace` procedures, all gated on `package_management` permission
- `assign` uses `context.session.user.id` as `assignedBy`
- Error handling: wraps service errors as `BAD_REQUEST`

**File:** `packages/api/src/routers/index.ts`
- Imported `packageInstanceStaffRouter` and registered as `packageInstanceStaff` in `baseRouter`

### Task 1.8 — EditAppointmentModal component
**File:** `apps/web/src/components/calendar/edit-appointment-modal.tsx` (NEW)
- Fetches appointment detail via `client.appointments.getById`
- Renders `StaffPicker` with current trainer pre-populated
- Submit translates `members.id` → `members.userId` via `findUserId` before calling `client.appointments.update({ staffAssignments })`
- Wraps `useApiMutation` with query invalidation on success

### Task 1.9 — Wire EditAppointmentModal into calendar
**File:** `apps/web/src/components/calendar/appointment.tsx`
- Added `editStaffAppointmentId` state
- Replaced "Edit" button with "Edit Staff" button that sets `editStaffAppointmentId`
- Added `EditAppointmentModal` to JSX rendered when `editStaffAppointmentId !== null`

### Task 1.10 — Assigned Staff section in PackageInstancesPage
**File:** `apps/web/src/components/pages/packages/instances-page.tsx`
- Added `staffInstanceId` + `assignStaffId` state
- Added `packageInstanceStaff.list` query, `members.list` (trainers) query
- Added `assignStaffMutation` (uses next available slotIndex) and `removeStaffMutation`
- Added "Staff" button column to each table row
- Added "Assigned Staff" dialog: shows current assignments with remove buttons, trainer select + Add button

---

## Key Implementation Decisions

- **staffId convention:** All `staffAssignments.staffId` values are `members.userId` (control-panel UUID) throughout service, router, and UI. The service converts to `members.id` only when updating `appointments.trainerId` FK.
- **Buffer check scope:** Buffer check now runs for ALL new staff (not just the existing trainerId), even when only staff changes (not time).
- **Slot-0 UPSERT:** `assignPackageInstanceStaff` uses `onConflictDoUpdate` on `(packageInstanceId, slotIndex)` so approval-flow pre-inserts are safely overwritten.
- **Empty array guard:** `replacePackageInstanceStaff` returns early before INSERT when `assignments.length === 0`, avoiding Drizzle `inArray([])` crash.

---

## Files Modified
- `apps/web/src/hooks/useAppointmentFormData.ts`
- `apps/web/src/hooks/useAppointmentFormState.ts`
- `apps/web/src/components/calendar/appointment.tsx`
- `apps/web/src/components/pages/packages/instances-page.tsx`
- `packages/api/src/routers/appointments.ts`
- `packages/api/src/routers/index.ts`
- `packages/services/src/appointment.service.ts`
- `packages/services/src/index.ts`
- `packages/db/src/seed-rbac.ts`

## Files Created
- `apps/web/src/components/calendar/edit-appointment-modal.tsx`
- `packages/api/src/routers/package-instance-staff.ts`
- `packages/services/src/package-instance-staff.service.ts`
