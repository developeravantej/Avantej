# Appointments
**Route:** `/appointment/view`
**File:** `apps/web/src/routes/_authenticated/appointment/view.tsx`
**Platform:** web
**Auth required:** `appointment_management:read` (with redirect fallback to `/dashboard`)
**Last updated:** 2026-05-12

---

## Recent refactor (2026-05-12 — web debt cleanup)

The `AppointmentCalendar` rendered by this route was decomposed into a feature folder under `apps/web/src/features/appointments/`. The route file itself is unchanged. Inside the calendar, presentational + dialog pieces are now isolated modules consuming shared types and pure helpers.

---

## 1. What It Does

**Purpose:** Calendar view (month / week / day) for organization appointments. Supports virtual recurring occurrences, multi-staff appointments, and bulk status changes.

**Produces:** `<AppointmentCalendar>` from `@/components/calendar/appointment` rendering one of three grid views with click-to-detail and add-appointment actions.

**On success:** Calendar renders appointments mapped through `mapApiAppointmentToCalendar`. Detail modal, edit-staff modal, and occurrence-action dialog mount on demand.

**On failure / error states:** "No organization selected" paragraph, error message if `appointments.list` throws, simple "Loading appointments..." placeholder.

---

## 2. How It Works

**Execution flow:**
1. `beforeLoad` calls `requirePermission({ resource: "appointment_management", action: "read" }, "/dashboard")` (stub — see notes).
2. `useUserContext()` resolves `organizationId`.
3. `getAppointmentQueryRange()` from `@/lib/appointment-mapper` returns `{ startFrom, startTo }` for the fetch window.
4. `useQuery(["appointments", orgId, startFrom, startTo])` → `client.appointments.list({ organizationId, startFrom, startTo, limit: 200 })`.
5. `useMemo` maps API rows to `CalendarAppointment[]` via `mapApiAppointmentToCalendar`.
6. `<AppointmentCalendar appointments={...} />` mounts; everything below is internal to the calendar component.

**Inside `AppointmentCalendar` (`@/components/calendar/appointment.tsx`):**
- Composes pure helpers from `@/features/appointments/utils` (`PX_PER_HOUR`, `PX_PER_MIN`, `statusStyle`, `assignColumns`, `buildRecurrenceParams`).
- Renders `<CalendarCell>` (month/week) or `<DayTimeGrid>` (day) — both in `@/features/appointments/components/`.
- Detail modal: `<CalendarDetailModal>`; recurrence prompt: `<OccurrenceActionDialog>`.
- Occurrence mutations consolidated in `useOccurrenceActions({ organizationId, onEditAll, onDialogClose })` hook from `@/features/appointments/hooks/`.
- Create flow: `useApiMutation` wraps `client.appointments.create` with `successMessage`, `errorMessage`, `invalidate: [["appointments"]]`.

**State:** TanStack Query at `staleTime: 60_000 ms`; local UI state for current date, view, selected appointment, group-select, modal visibility.

**Side effects:** All occurrence + status mutations invalidate `["appointments"]`. `materializeOccurrence`, `splitSeries`, `cancelSeries`, `cancelFuture` toasts surface via `useOccurrenceActions`.

---

## 3. What Depends On It

**API endpoints:**
- `client.appointments.list({ organizationId, startFrom, startTo, limit: 200 })`
- (Inside `AppointmentCalendar`) `client.appointments.create`, `client.appointments.update`, `client.appointments.materializeOccurrence`, `client.appointments.splitSeries`, `client.appointments.cancelSeries`, `client.appointments.cancelFuture`

**Components:**
- `AppointmentCalendar` — `@/components/calendar/appointment` (orchestrator)
- `CalendarCell`, `CalendarDetailModal`, `DayTimeGrid`, `OccurrenceActionDialog` — `@/features/appointments/components/`
- `AddAppointmentModal`, `EditAppointmentModal` — `@/components/calendar/`

**Hooks:**
- `useUserContext`, `useQuery`, `useMemo` (route)
- `useApiMutation` (calendar create flow)
- `useOccurrenceActions` (`@/features/appointments/hooks/useOccurrenceActions`)

**Navigation in:** Direct URL or sidebar link.
**Navigation out:** Permission denied → `/dashboard`.

---

## 4. Data Shapes

**DB tables touched (read-only at route level):**
- `appointments` — list
- `recurrence_rules`, `appointment_staff`, `appointment_clients`, `services`, `member_profiles`, `members`, `user` (control panel) — joined by `listAppointmentsWithRecurrence`

**Key types (from `@/features/appointments/types`):**
```typescript
interface Appointment {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: "confirmed" | "pending" | "cancelled";
  clientName: string;
  service: string;
  assignedTo?: { id: string; name: string; email?: string; avatar?: string; color?: string };
  clientEmail?: string;
  clientPhone?: string;
  location?: string;
  notes?: string;
  duration?: number;
  isVirtual?: boolean;   // not-yet-materialized recurring occurrence
  parentId?: string;     // parent recurring appointment ID
}

type CalendarView = "monthly" | "weekly" | "daily";

type CreateAppointmentParams = {
  start: Date;
  duration: number;
  notes?: string;
  userId?: string | null;
  staffAssignments?: { staffId: string; slotIndex: number }[];
  recurrence?: CreateRecurrenceParams;
};
```

---

## 5. Tests

**Test files:** None.

**Risk areas:**
- Permission redirect (route-guard is a stub).
- Virtual occurrence rendering (synthetic `virtual__{parentId}__{date}` IDs).
- 200-row hard cap with no pagination.
- Day-view auto-scroll (`useEffect` deliberately omits `appointments` from deps to avoid scroll-jump on background refetch — see `appointment.tsx:230`).

---

## 6. Notes

- **Permission stub:** `requirePermission` does not actually block in current implementation; rely on UI / server-side checks.
- **Feature folder split (2026-05-12):** Calendar pieces moved out of `@/components/calendar/*` into `@/features/appointments/{types,utils,hooks,components}`. The route component remained at its original path.
- **Pure helpers:** `assignColumns`, `statusStyle`, `buildRecurrenceParams`, `PX_PER_HOUR`, `PX_PER_MIN` exported from `@/features/appointments/utils` — no React imports, safe for SSR.
- **Occurrence actions consolidated** in `useOccurrenceActions` hook (was inline switch/case in `AppointmentCalendar` pre-refactor). Handles 6 actions: `cancel_this`, `cancel_future`, `cancel_all`, `edit_this`, `edit_future`, `edit_all`.
- **Day-view scroll:** Auto-scrolls to current time on today, first appointment otherwise, 2h default fallback. Excludes `appointments` from deps intentionally.
- **Stale time:** 60 s; appointments refetch in background on focus.
- **No error UI beyond a paragraph** — design assumes loading states + toasts suffice.
