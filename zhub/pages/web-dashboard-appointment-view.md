# Appointments (Calendar View)

**Route:** `/dashboard/appointment/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-09

---

## New in this update (2026-05-09)

- **Recurring appointments** — `appointments.create` now accepts a `recurrence` param; `appointments.list` routes through `listAppointmentsWithRecurrence` which lazily expands recurring series into virtual occurrences (IDs prefixed `virtual__`).
- **Multi-staff assignments** — up to N staff per appointment via `appointment_staff` table; primary staff is resolved by lowest `slotIndex`. `appointments.update` accepts `staffAssignments[]` array.
- **Occurrence action semantics** — 6 distinct actions on virtual occurrences: edit this only, edit this and future, edit all, cancel this, cancel future, cancel all. Backed by `materializeOccurrence`, `splitSeries`, `cancelSeries`, `cancelFuture` procedures.
- **EditAppointmentModal** — new component `apps/web/src/components/calendar/edit-appointment-modal.tsx` for editing staff on existing appointments without touching the full add-appointment form.
- **`recurrence-adapter.ts`** — `mapCustomRecurrenceToParams()` converts UI-layer `CustomRecurrence` shape to API `RecurrenceParams` shape; maps `SU/M/T/W/TH/F/S` day keys to weekday integers 0–6.
- **Route component now uses `AppointmentList`** (not `AppointmentCalendar`) as the primary rendering component.
- **Qualified trainer filter** — `StaffPicker` shows a caption indicating whether the trainer list is filtered by the selected service's qualified trainers, with fallback to all trainers when the service has no trainer assignments.

---

## 1. What It Does

**Purpose (user perspective):** Displays a list/calendar of appointments, filtered by trainer, allowing admins to browse all trainers or trainers to see only their own schedule. Supports creating, editing, and cancelling both one-off and recurring appointments with multi-staff assignments.

**Produces:** A full-page appointment list with an optional trainer-filter sidebar for admins and staff.

**On success:** Appointments (including virtual occurrences of recurring series) are rendered as event cards. Admins/staff can select a specific trainer from the sidebar. Clicking "Add Appointment" opens the add-appointment modal. Clicking an event opens the detail view with status-change and edit actions.

**On failure / error states:**
- No `organizationId`: renders paragraph "No organization selected."
- API error: renders error message from the exception.
- Loading: spinner via `AppointmentList` while appointments fetch.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId, memberRole, memberId
  → getAppointmentQueryRange() → startFrom / startTo window
  → useQuery(["appointments", orgId, trainerId, startFrom, startTo])
      → client.appointments.list({ organizationId, trainerId, startFrom, startTo, limit:200 })
          → listAppointmentsWithRecurrence()          # expands recurring series into virtual items
          → post-expansion filters (status, serviceId, branchId, limit)
          → batch resolves: serviceName, trainerName (by member profile), clientName
  → mapApiAppointmentToCalendar()                     # lib/appointment-mapper.ts
  → <TrainerSidebar> (admins + staff only)
      → client.members.list({ role:"trainer" })
  → <AppointmentList appointments={...} isLoading={...} defaultTrainerId={...} />
      → internally: <AddAppointmentModal>
          → client.appointments.create({ ..., recurrence?, staffAssignments? })
      → internally: status-change mutation
          → client.appointments.update (status change, enforces state machine)
      → internally: <EditAppointmentModal>
          → client.appointments.getById
          → client.appointments.update({ staffAssignments })
      → internally: OccurrenceActionDialog (for virtual occurrences)
          → materializeOccurrence / splitSeries / cancelSeries / cancelFuture
```

**Inputs:**
- `?view=weekly` query param — sets initial calendar view (`monthly` default, passed to `AppointmentList`)
- `userContext.organizations[].hierarchy.member.role` — `"trainer"` locks filter to self; `"admin"` and `"staff"` can browse all trainers
- Trainer sidebar selection (admin/staff mode)

**State management:**
- `sidebarSelectedId` — locally selected trainer UUID; `null` means "all"
- `selectedTrainerId`: if `canViewAllTrainers`, uses sidebar selection; otherwise locks to `memberId`
- Query cached at `staleTime: 60_000 ms`

**Virtual occurrences:**
- `listAppointmentsWithRecurrence` returns items where `isVirtual: true` and `id` is `"virtual__{parentId}__{isoDate}"`.
- Virtual items inherit all fields from the parent (serviceId, trainerId, userId, etc.) with `startTime` shifted to the occurrence date.
- `appointment_staff` rows for virtual items are looked up by `parentId`, not by the synthetic id.
- The `isVirtualId(id)` helper checks for the `virtual__` prefix.

**Recurrence create flow:**
- UI form (`RepeatRuleSection`) builds a `CustomRecurrence` object.
- `mapCustomRecurrenceToParams(cr)` (`apps/web/src/lib/recurrence-adapter.ts`) converts it to `RecurrenceParams` for the API.
- `appointments.create` inserts the parent row with `isRecurring: true` and inserts a `recurrence_rules` row.

**Occurrence action semantics (OccurrenceActionDialog):**
| Action | API call | Effect |
|--------|----------|--------|
| Edit this occurrence only | `materializeOccurrence` | Creates a real child row; virtual slot is replaced by the child |
| Edit this and future | `splitSeries` | Truncates old series; creates new series from `fromDate` |
| Edit all | `update` on parent | Updates parent row fields; all virtual occurrences reflect the change |
| Cancel this | `materializeOccurrence` + status=cancelled | Materializes then cancels single occurrence |
| Cancel future | `cancelFuture` | Truncates series end date; cancels materialized children on/after date |
| Cancel all | `cancelSeries` | Cancels parent + all materialized children (skips `completed`) |

**Outputs:** Appointment list UI; toasts on mutations.

**Side effects:** All mutations invalidate the appointments query. `cancelSeries`/`cancelFuture` skip rows with status `"completed"`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.appointments.list` — recurrence-aware fetch; expands virtual occurrences server-side; post-expansion filter for status/serviceId/branchId
- `client.appointments.listForUser` — client view (session user); no staff permission required; used by native app
- `client.appointments.getById` — single appointment detail; accessible by owning client or staff with `appointment_management:read`
- `client.appointments.create` — create new appointment; accepts `recurrence` and `staffAssignments[]`
- `client.appointments.update` — update status or `staffAssignments`; enforces status machine; restores credits on cancellation; creates commission splits on completion
- `client.appointments.materializeOccurrence` — convert virtual occurrence to real child row
- `client.appointments.splitSeries` — split a recurring series at a date
- `client.appointments.cancelSeries` — cancel all occurrences in a series
- `client.appointments.cancelFuture` — cancel occurrences from a date onward
- `client.members.list` (via `TrainerSidebar`) — list active trainers for sidebar

**Uses these components:**
- `AppointmentList` — `apps/web/src/components/appointments/appointment-list.tsx` — primary list/detail UI with add modal
- `TrainerSidebar` — `apps/web/src/components/calendar/trainer-sidebar.tsx` — searchable trainer list; display: `member.displayName ?? member.name ?? member.email ?? "Unknown Trainer"`; search on `member.name ?? member.email`
- `AddAppointmentModal` — `apps/web/src/components/calendar/add-appointment-modal.tsx` — internally managed by `AppointmentList`
- `EditAppointmentModal` — `apps/web/src/components/calendar/edit-appointment-modal.tsx` — edit staff on existing appointment; uses `StaffPicker` + `useAppointmentFormData`
- `AppointmentCalendar` — `apps/web/src/components/calendar/appointment.tsx` — calendar grid (month/week/daily views) with virtual-occurrence rendering and `OccurrenceActionDialog`

**Uses these hooks:**
- `useUserContext` — current org, member role/id
- `useQuery` (TanStack Query) — appointment fetch
- `useMemo` — maps raw API response to calendar shape
- `useAppointmentFormData` — supplies `trainers` list (includes `userId` field for qualified trainer filter)
- `useAppointmentFormState` — full form state including recurrence and staffId/userId fix

**Navigation: who navigates here:** `app-sidebar.tsx` (sidebar link "Appointments" under Appointments section)

**Navigation: where it goes:** Stays on page; no outbound navigation triggered.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `appointments` | SELECT / INSERT / UPDATE | `id`, `type`, `startTime`, `endTime`, `duration`, `serviceId`, `branchId`, `status`, `sessionTotal`, `pricePerClient`, `userId`, `trainerId`, `packageInstanceId`, `creditsUsed`, `location`, `bookingNumber`, `classSlotId`, `cancelledAt`, `cancellationReason`, `description`, `imageUrl`, `roomId`, `googleCalendarEventId`, `isRecurring`, `recurringParentId`, `recurringEndDate`, `paymentStatus`, `notes`, `createdBy` |
| `recurrence_rules` | INSERT / UPDATE | `appointmentId`, `frequencyValue`, `timeUnit`, `repeatOn`, `monthlyType`, `monthlyDayOfWeek`, `monthlyWeekOfMonth`, `endsType`, `endsAfterOccurrences`, (no endsOn column — derived from `appointments.recurringEndDate`) |
| `appointment_staff` | SELECT / INSERT | `appointmentId`, `staffId`, `slotIndex` — multi-staff per appointment |
| `services` (tenant) | SELECT (batch join) | `id`, `name` — resolved for `serviceName` |
| `member_profiles` (tenant) | SELECT (batch join) | `memberId`, `displayName` — resolved for `trainerName` |
| `members` (tenant) | SELECT (batch join) | `id`, `userId` — resolves staffId to memberId for profile lookup (handles member.id vs member.userId inconsistency) |
| `user` (control panel) | SELECT (batch join) | `id`, `name` — resolved for `clientName` |
| `members` | SELECT (TrainerSidebar) | `userId`, `role`, `status`, `displayName`, `name`, `email` |
| `appointment_clients` | INSERT / SELECT | `appointmentId`, `clientId`, `packageInstanceId`, `pricePaid`, `attended`, `clientType` ("member"\|"walk_in"), `walkInCustomerId` (nullable) |
| `commission_splits` | INSERT (non-fatal) | Created when status→'completed' |

**Key types:**
- `ApiAppointment` / `CalendarAppointment` — `apps/web/src/lib/appointment-mapper.ts`; `CalendarAppointment` adds `isVirtual?: boolean` and `parentId?: string`
- `RecurrenceParams` — `apps/web/src/lib/recurrence-adapter.ts`
- `CustomRecurrence` — `apps/web/src/types/appointments.ts`; UI form shape with string day keys
- `OccurrenceEditAction` — `apps/web/src/types/appointments.ts`; enum of 6 action types

**`mapCustomRecurrenceToParams` mapping:**
- `frequency` → `frequencyValue`
- `timeUnit` (`"day"|"week"|"month"`, year disabled) → `timeUnit`
- `repeatOn` string keys (`SU/M/T/W/TH/F/S`) → weekday integers 0–6
- `endsType: "on"` → `"on_date"`, `"after"` → `"after_occurrences"`, else `"never"`
- `monthlyType: "week"` → `"day_of_week"`, else `"day_of_month"`

**Permission required:** `appointment_management:read` (enforced in `beforeLoad` via `requirePermission`)

---

## 5. Tests

**Test files:** None found (no test files reference `appointment/view`)

**Not tested:** Role-based trainer lock, date-range query, sidebar trainer filtering, add/update appointment mutations, recurring appointment expansion, occurrence action dialogs

---

## 6. Notes

- `requirePermission` in `beforeLoad` is documented as a stub in route-guards.ts — it does not actually block access in the current implementation.
- Trainers see the page titled "My Schedule"; admins and staff see "Appointments".
- `AppointmentList` is the primary rendering component (replacing `AppointmentCalendar` as the top-level component passed from the route). `AppointmentCalendar` is still used inside `AppointmentList` for the calendar grid.
- `getAppointmentQueryRange()` determines the fetch window.
- `defaultTrainerId` is passed through to the inner list/calendar so the team-filter pre-selects the trainer.
- Virtual occurrence IDs (`virtual__{parentId}__{isoDate}`) are synthetic — they don't exist in the DB. Actions on them call `materializeOccurrence` first to create a real row, then apply updates.
- `staffId` in `appointment_staff` is written inconsistently — some callers use `member.userId`, others use `member.id`. The `list` handler normalises both by joining `members` on both `id` and `userId` before doing the profile lookup.
- `appointmentStaff` rows for virtual occurrences are looked up by `parentId`, not by the virtual id, because virtual rows don't have their own staff rows in the DB.
- Qualified trainer filter in `StaffPicker`: when a service is selected and has trainer assignments, the list is filtered to those trainers. If no assignments exist, falls back to all trainers with a caption note.

---

## 7. Recent Changes (2026-04-20 — Pipeline Audit B/C/D)

**Status machine enforcement (`appointment-status-machine.ts`):**
- `updateAppointment` calls `assertValidTransition(existing.status, params.status)` before allowing any status change.
- Valid transitions: `pending→confirmed|cancelled|no-show`, `confirmed→completed|cancelled|no-show`, terminal states have no allowed transitions.
- Throws `ORPCError("PRECONDITION_FAILED")` on invalid transition.

**Cancellation credit restoration:**
- When status transitions to `"cancelled"`, `creditsUsed` is restored to the parent `package_instances` row inside the update transaction (`FOR UPDATE` lock).
- If the package was `exhausted`, it is restored to `active` after credit return (non-fatal if package not found).

**Commission split creation on completion:**
- When status transitions to `"completed"`, `calculateCommissionForAppointment` is called; inserts one `commission_split` per assigned staff member.
- Unclaimed slot weightage redistributes evenly to present coaches. Non-fatal.

**`appointment_clients` schema additions (migration 0027):**
- `client_type TEXT NOT NULL DEFAULT 'member'` — `"member"` or `"walk_in"`.
- `walk_in_customer_id UUID` — nullable FK to `walk_in_customers`.

---

## 8. Recent Changes (2026-04-17 — Rooms Management)

The `AddAppointmentModal` received changes as part of Rooms Management (see `zhub/pages/web-dashboard-rooms-view.md`):

- **Area dropdown empty-state link.** When `rooms.length === 0`, renders a dashed-border inline hint: "No rooms available. Create one →" linking to `/dashboard/rooms/view?returnTo=/dashboard/appointment/view`. Clicking calls `onClose()` first.
- **Employee dropdown is context-aware.** Disabled until a room is selected; placeholder computed by `employeePlaceholder = useMemo(...)`: no room → "Select an area first", room + no employees → "There are no employees available", room + employees → "Select an employee".
- **Multi-appointment mode deferred.** Multi-appointment mode area/employee dropdowns near line 1828 still show old always-empty dropdown when no rooms exist.
