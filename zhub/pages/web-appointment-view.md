# Appointments

**Route:** `/appointment/view`
**File:** `apps/web/src/routes/_authenticated/appointment/view.tsx`
**Platform:** web
**Auth required:** `appointment_management:read` (with redirect fallback to `/dashboard`)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Calendar view for managing appointments. Display all organization appointments across multiple calendar views (monthly, weekly, daily).

**Produces:** Calendar UI (AppointmentCalendar component) showing appointments with details like attendee, time, status, notes.

**On success:** Calendar loads and renders appointments mapped from API response. User can switch views and interact with appointments.

**On failure / error states:** Loading spinner, error message if appointments fail to load, "no org selected" message if org context missing.

---

## 2. How It Works

**Execution flow:**
1. Before load: Check `{ resource: "appointment_management", action: "read" }` permission → redirect to `/dashboard` if denied
2. On mount: Fetch organizationId from useUserContext
3. Calculate date range: `getAppointmentQueryRange()` returns startFrom, startTo
4. Load appointments: `client.appointments.list({ organizationId, startFrom, startTo, limit: 200 })`
5. Map API appointments to calendar format: `mapApiAppointmentToCalendar()` for each appointment
6. Render AppointmentCalendar component with mapped appointments

**Inputs:**
- Org from session context
- Date range derived from current time

**State management:**
- TanStack Query: `queryKey = ["appointments", organizationId, startFrom, startTo]`
- `staleTime: 60 * 1000` (1 minute)
- Memoized appointment mapping: `useMemo(() => apiAppointments.map(mapApiAppointmentToCalendar), [apiAppointments])`

**Outputs:** Calendar UI component with appointment list

**Side effects:** None explicit in this file (calendar component may have internal mutations)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.appointments.list({ organizationId, startFrom, startTo, limit: 200 })` — fetch appointments in date range

**Uses these components:**
- `AppointmentCalendar` from `@/components/calendar/appointment` — calendar view and interaction
- lucide icons: `Calendar` (implicit in component)

**Uses these hooks:**
- `useUserContext()` — fetch org ID
- `useQuery()` — TanStack Query
- `useMemo()` — memoize appointment mapping

**Navigation: who navigates here:** `/appointment/view` route (protected by requirePermission with fallback)

**Navigation: where it goes:** Denied access → `/dashboard`

---

## 4. Data Shapes

**DB tables touched:**
- `tenantDb.appointments` — read only

**Key types / Zod schemas:**
```typescript
// API response shape (pre-mapping)
type ApiAppointment = {
  id: string;
  title: string;
  startTime: string | Date;
  endTime: string | Date;
  status: "confirmed" | "pending" | "cancelled";
  // ... other fields
};

// Calendar-mapped shape
type CalendarAppointment = {
  id: string;
  title: string;
  start: Date; // converted from API time
  end: Date;
  status: "confirmed" | "pending" | "cancelled";
  // ... other fields
};

// Query range
type DateRange = {
  startFrom: string | Date;
  startTo: string | Date;
};
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Permission check and redirect logic
- Date range calculation (edge cases around month/year boundaries)
- Appointment mapping edge cases (timezone, null dates)
- Query stale time behavior (1 minute refresh)
- Large appointment lists (limit is 200)

---

## 6. Notes

- **RBAC with fallback:** Uses `requirePermission()` with explicit fallback to `/dashboard` if denied
- **Date range calculated:** `getAppointmentQueryRange()` abstracted away; likely covers current + next month or week
- **Mapped appointments:** API appointments are transformed via `mapApiAppointmentToCalendar()` before rendering
- **Limit: 200 appointments** — query hard-coded to limit 200; may need pagination for large orgs
- **Stale time:** 1 minute; appointments checked for updates every 1 minute
- **No error handling in UI:** Only loading and "no org" message shown; errors logged but not displayed
- **Calendar component:** All calendar logic, interactions, and view switching delegated to AppointmentCalendar

