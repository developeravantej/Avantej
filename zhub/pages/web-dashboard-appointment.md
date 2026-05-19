# Appointments Calendar (Dashboard)
**Route:** `/dashboard/appointment/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`
**Platform:** web
**Auth required:** `appointment_management:read` (`requirePermission` in `beforeLoad`, redirects to `/dashboard`)
**Last updated:** 2026-05-12

---

## Recent refactor (2026-05-12 — web debt cleanup)

`AppointmentList` (the primary renderer here) was decomposed. Its dialogs and per-day view subcomponents now live in `apps/web/src/features/appointments/components/`. Pure helpers (date grouping, status maps, formatters) moved to `@/features/appointments/utils`. The route file itself is unchanged.

---

## 1. What It Does

**Purpose:** View appointments in a list/card layout with monthly navigation and an optional trainer-filter sidebar. Admins/staff browse all trainers; trainers/clients see only themselves.

**Produces:**
- `<TrainerSidebar>` (admin/staff only) on the left for trainer selection
- `<AppointmentList>` on the right with month switcher, view toggle (list/card), and per-day groupings

**On success:** Appointments mapped to `CalendarAppointment[]` and grouped by date. Detail/attendance/edit dialogs mount on demand.

**On failure / error states:** "No organization selected." paragraph, error message if `appointments.list` throws, skeleton rows while loading.

---

## 2. How It Works

**Execution flow:**
1. `beforeLoad` → `requirePermission({ resource: "appointment_management", action: "read" }, "/dashboard")` (stub — does not block in practice).
2. `useUserContext()` resolves `organizationId`, `memberRole`, `memberId`.
3. `canViewAllTrainers = role === "admin" || role === "staff"`.
4. `sidebarSelectedId` local state; `selectedTrainerId = canViewAllTrainers ? sidebarSelectedId : memberId ?? null`.
5. `getAppointmentQueryRange()` from `@/lib/appointment-mapper` returns `{ startFrom, startTo }`.
6. `useQuery(["appointments", orgId, selectedTrainerId, startFrom, startTo])` → `client.appointments.list({ organizationId, trainerId, startFrom, startTo, limit: 200 })`.
7. `useMemo` maps API rows via `mapApiAppointmentToCalendar`.
8. Renders sidebar + `<AppointmentList appointments isLoading defaultTrainerId={selectedTrainerId} />`.

**Inside `<AppointmentList>` (`@/components/appointments/appointment-list.tsx`):**
- Filters to current month, groups via `groupByDate()` from `@/features/appointments/utils`.
- Renders either `<DayListView>` or `<DayCardView>` (both from `@/features/appointments/components/DayAppointmentViews`) per date bucket.
- Dialogs mount on selection: `<AppointmentDetailDialog>`, `<AttendanceDialog>`, `<EditAppointmentDialog>` — all under `@/features/appointments/components/`.
- Mutations use `useApiMutation` wrapper around `client.appointments.create | update`; all invalidate `["appointments"]`.
- `<AppointmentDetailDialog>` embeds `<AppointmentStatusHistory>` which calls `client.appointments.statusHistory` and renders the shared `<StatusTimeline>`.

**State:**
- Query `staleTime: 60_000 ms`
- Refetch on trainer change (via `selectedTrainerId` in key)
- Local UI: `view: "list"|"card"`, `currentMonth`, dialog state (`selectedAppt`, `editAppt`, `attendanceApptId`, `editForm`)

**Side effects:** Auto-scrolls to today's date group on mount. All mutations toast + invalidate query.

---

## 3. What Depends On It

**API endpoints:**
- `client.appointments.list` — fetch with `trainerId` filter
- `client.appointments.create` — accepts `recurrence`, `staffAssignments[]`
- `client.appointments.update` — status / time / staff edits
- `client.appointments.statusHistory` — fed to `AppointmentStatusHistory`
- (Recurring) `materializeOccurrence`, `splitSeries`, `cancelSeries`, `cancelFuture` — invoked by `useOccurrenceActions` inside `AppointmentCalendar` (also reachable via this list)

**Components:**
- `TrainerSidebar` — `@/components/calendar/trainer-sidebar`
- `AppointmentList` — `@/components/appointments/appointment-list`
- `AppointmentDetailDialog`, `AttendanceDialog`, `EditAppointmentDialog`, `DayListView`, `DayCardView`, `AppointmentStatusHistory` — `@/features/appointments/components/`
- `AddAppointmentModal` — `@/components/calendar/add-appointment-modal`

**Hooks:**
- `useUserContext`, `useQuery`, `useMemo`, `useState`, `useEffect`
- `useApiMutation` (`@/hooks/useApiMutation`) — used by every mutation in `AppointmentList`

**Navigation in:** Sidebar "Appointments" link.
**Navigation out:** Permission denied → `/dashboard`.

---

## 4. Data Shapes

**DB tables touched:**
- `appointments` — list/update/create
- `recurrence_rules`, `appointment_staff`, `appointment_clients` — joined server-side
- `services`, `member_profiles`, `members`, `user` (control panel) — batch joins for display names
- `appointment_status_history` — read via `statusHistory` procedure

**Key types:**
- `CalendarAppointment` — `@/lib/appointment-mapper` (with optional `isVirtual`, `parentId`)
- `EditForm` — exported from `@/features/appointments/components/EditAppointmentDialog` (`{ date, time, duration, notes, description }`)
- `STATUS` map, `formatDateHeader`, `groupByDate`, `formatTime`, `formatDuration`, `getInitials`, `isToday`, `isTomorrow` — all `@/features/appointments/utils`

---

## 5. Tests

**Test files:** None found.

**Risk areas:**
- Role lock (assumes API also enforces `trainerId` scoping).
- 200-row hard limit; month-filter happens client-side so a busy org may exceed the window.
- Auto-scroll to today timing (`useEffect` runs once on `isLoading` transition).
- Status history dialog query (no error UI in `AppointmentStatusHistory`).
- Edit dialog parses date/time strings into local-time `Date` — DST edge cases.

---

## 6. Notes

- **Feature folder split (2026-05-12):** `AppointmentList` now delegates almost everything to `@/features/appointments/{components,hooks,utils}`. The list file dropped from ~700 LOC of inline dialog markup to ~370 LOC of composition.
- **`useApiMutation` wrapper:** All `client.appointments.*` calls in `AppointmentList` use this hook for consistent toast/invalidation/error handling. The `errorMessage` callback for `create` propagates `"Conflict:"` prefix verbatim (DB exclusion constraint surfaces overlap errors).
- **Role check:** `memberRole.toLowerCase()` against literals; assumes hierarchy always exists.
- **Trainer sidebar hidden** when role !== "admin" / "staff".
- **Today auto-scroll** uses two anchors (`todayRef` on today's group, or anchor div before/after when today has no appointments) — `_insertBeforeKey` / `_anchorAtEnd` logic.
- **Status timeline:** `AppointmentStatusHistory` is a thin wrapper over the shared `<StatusTimeline>` UI primitive; powered by `client.appointments.statusHistory`.
- **`requirePermission` is a stub** — does not actually block access at route level.
