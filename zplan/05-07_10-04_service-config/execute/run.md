# Plan E Execution Summary — Service Config & Trainer-to-Service Assignment

Date: 2026-05-07

## Phase 1 — Category Booking Rules Display

### 1.1 (pre-existing — verified complete)
`serviceCategoryConfig.getByCategoryId` already exposed and used in service detail view.

### 1.2 (verify-only — already done)
Category booking rules display correctly in service-category UI.

### 1.3 — Cache invalidation fix
**File**: `apps/web/src/components/forms/service-category-form.tsx`
Added `orpc.serviceCategoryConfig.getByCategoryId.key()` to the `invalidate` array in `useApiMutation` so the category config query re-fetches after create/update.

## Phase 2 — Trainer-to-Service Assignment Admin UI

### 2.1 — `listForService` backend procedure
**File**: `packages/api/src/routers/service-members.ts`
- Added import for `memberProfiles` from `@avantej-core/db/schema/tenant/member-profiles`
- Added `listForService` procedure: OR-permission check (user_management | service_management | appointment_management read), LEFT JOINs serviceMembers → memberProfiles, returns `{ memberId, isPrimary, displayName }`

### 2.2 — Trainers tab in ServiceDetailDialog
**File**: `apps/web/src/components/forms/service-detail-dialog.tsx`
- Added TanStack Query imports (`useQuery`, `useMutation`, `useQueryClient`)
- Added Tabs, Select component imports
- Added `orpc` import
- Added inline `TrainersTab` component: lists assigned trainers, Select dropdown of unassigned members, assign/remove mutations with toast feedback
- Wrapped dialog content in `<Tabs>` with Details + Trainers tabs

## Phase 3 — Appointment Form Trainer Filter

### 3.1 — Service-scoped trainer query in `useAppointmentFormState`
**File**: `apps/web/src/hooks/useAppointmentFormState.ts`
- Added `listForService` query (enabled when `firstServiceId` set)
- Added `qualifiedTrainerIds` Set via `useMemo`
- Added `derivedTrainers` (filtered list, falls back to full list if none qualified)
- Added `trainerFilterActive` boolean (true when list is narrowed)
- Added `trainerFilterFallback` boolean (true when no qualified trainers — showing full list)
- Added useEffect to clear `employeeId` (not `assignedTo`) when service changes and current trainer is not qualified
- Exported all 3 new fields in return object

**Key fix**: Plan spec incorrectly said clear `assignedTo`; corrected to `employeeId` (what StaffPicker actually controls).

### 3.2 — `AppointmentFormContent` props
**File**: `apps/web/src/components/calendar/appointment-form/AppointmentFormContent.tsx`
- Added `derivedTrainers`, `trainerFilterActive`, `trainerFilterFallback` to `AppointmentFormContentProps` type
- Destructured in function signature
- Passed `derivedTrainers` to `StaffPicker` (original `trainers` still used for blocked-timing and multi-slot dropdowns)
- Passed `trainerFilterActive` and `trainerFilterFallback` to `StaffPicker`

### 3.3 — `StaffPicker` caption props
**File**: `apps/web/src/components/calendar/appointment-form/StaffPicker.tsx`
- Added `trainerFilterActive?` and `trainerFilterFallback?` to `StaffPickerProps`
- Rendered caption paragraphs below the Trainer label:
  - `trainerFilterActive`: "Showing trainers qualified for the selected service."
  - `trainerFilterFallback`: "No trainers assigned to this service — showing all trainers." (amber color)

## Type-check result

`bun check-types`:
- **web**: PASS (0 errors in web package)
- server: pre-existing errors in scripts/, test files, better-auth, middleware — none in files modified by this plan

## Files modified

1. `apps/web/src/components/forms/service-category-form.tsx`
2. `packages/api/src/routers/service-members.ts`
3. `apps/web/src/components/forms/service-detail-dialog.tsx`
4. `apps/web/src/hooks/useAppointmentFormState.ts`
5. `apps/web/src/components/calendar/appointment-form/AppointmentFormContent.tsx`
6. `apps/web/src/components/calendar/appointment-form/StaffPicker.tsx`
