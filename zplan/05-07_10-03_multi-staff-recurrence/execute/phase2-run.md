# Phase 2 Execution Summary — Multi-Staff + Recurrence Engine

Date: 2026-05-07

## Files Created

### Backend
- `packages/db/src/migrations/tenant/0050_add_is_recurring_idx.sql` — CREATE INDEX on appointments.is_recurring
- `packages/db/src/generated/tenant-migrations.generated.ts` — regenerated (0050 appended)
- `packages/services/src/recurrence.service.ts` — core recurrence engine:
  - `expandRecurrenceRule(rule, parentStartTime, endsOn, windowStart, windowEnd)` — pure date expansion
  - `listAppointmentsWithRecurrence(tenantDb, params)` — merged list (virtual + real + standalone)
  - `makeVirtualId`, `isVirtualId`, `parseVirtualId` — synthetic ID helpers
  - `MAX_VIRTUAL_OCCURRENCES = 500`
  - `AppointmentWithOccurrence` interface

### Frontend
- `apps/web/src/lib/recurrence-adapter.ts` — maps CustomRecurrence UI shape → API RecurrenceParams
- `apps/web/src/types/appointments.ts` — added `OccurrenceEditAction` type

### Tests
- `apps/server/src/tests/unit/recurrence-expansion.test.ts` — 14 unit tests for expansion + virtual ID helpers (all pass)

## Files Modified

### Schema
- `packages/db/src/schema/tenant/appointments.ts` — added `isRecurringIdx`

### Services
- `packages/services/src/appointment.service.ts`:
  - Added `recurrenceRules` import
  - Added `recurrence?` field to `CreateAppointmentParams`
  - Added A.1.8 in `createAppointment` transaction: sets `isRecurring=true`, `recurringEndDate`, inserts `recurrence_rules` row
- `packages/services/src/index.ts` — exported all recurrence service symbols

### Router
- `packages/api/src/routers/appointments.ts`:
  - Added imports: `listAppointmentsWithRecurrence`, `isVirtualId`, `and`, `gte`, `appointments`, `recurrenceRules`
  - Removed `listAppointments` (no longer used in `list`)
  - `list` procedure: replaced `listAppointments` with `listAppointmentsWithRecurrence`; enrichment loop updated to handle virtual IDs (staff lookup uses parentId for virtual rows)
  - `create` procedure: added `recurrence` optional z.object input field
  - NEW: `materializeOccurrence` — creates a real child appointment from a virtual occurrence; catches PG unique violation
  - NEW: `splitSeries` — splits a recurring series at a fromDate (truncates old, creates new parent + rule, re-parents materialized children)
  - NEW: `cancelSeries` — cancels parent + all children
  - NEW: `cancelFuture` — truncates series end date + cancels materialized children on/after fromDate

### Frontend
- `apps/web/src/components/calendar/appointment.tsx`:
  - Added `RefreshCw` icon import, `OccurrenceEditAction` import
  - Extended `Appointment` interface with `isVirtual?`, `parentId?`
  - Added `occurrenceDialogAppt` state
  - Extended `createMutation` to accept `recurrence` param
  - Added `handleOccurrenceAction` — routes to `materializeOccurrence` / `cancelFuture` / `cancelSeries` / `splitSeries` based on action
  - Updated `handleAppointmentClick` — shows occurrence dialog for virtual/recurring occurrences
  - Updated `handleSubmitAppointment` — maps CustomRecurrence to RecurrenceParams when recurrence === "custom"
  - Updated `renderCard` — adds dashed border + `RefreshCw` icon for virtual occurrences
  - Added inline `OccurrenceActionDialog` overlay with 6 actions
- `apps/web/src/components/calendar/appointment-form/RepeatRuleSection.tsx` — disabled "year" SelectItem with "(coming soon)" label

## Deviations from Plan

1. **`endsOn` is NOT a column in `recurrence_rules`** — it lives on `appointments.recurringEndDate`. The `expandRecurrenceRule` signature was widened to accept `endsOn: Date | null` as a separate parameter (sourced from `parent.recurringEndDate`). This is architecturally correct and avoids duplicating the data.

2. **`"write"` is not a valid Action type** — replaced with `"create"` in all 4 new procedures (`materializeOccurrence`, `splitSeries`, `cancelSeries`, `cancelFuture`).

3. **Cancelled parent guard** — `listAppointmentsWithRecurrence` filters out parents with `status === 'cancelled'` from expansion, so cancelled series don't keep emitting virtual occurrences forever.

4. **Virtual occurrence staff enrichment** — the `list` handler uses `parentId` as the staff lookup key for virtual rows (parent's appointmentStaff rows are re-used).

5. **Phase 2.10 (GCal)** — skipped as instructed.

## Type-check Result

`bun check-types` — 0 errors in new/modified files. All errors are pre-existing (bun:test module declarations in tsconfig, legacy scripts).

## Lint Result

`bun check` — 0 errors, 138 warnings (all pre-existing). New files have 0 lint issues.

## Test Result

14/14 unit tests pass in `recurrence-expansion.test.ts`.
