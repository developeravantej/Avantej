# Appointments Calendar

**Route:** `/dashboard/appointment/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`
**Platform:** web
**Auth required:** rbac({resource: "appointment_management", action: "read"})
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View organization appointments in a calendar layout. Admins/staff see all trainers; trainers see only their own appointments.

**Produces:**
- Optional sidebar (admin/staff only): list of trainers, click to filter calendar
- Main calendar view: AppointmentList component with appointments mapped from API

**On success:** Calendar loads and displays appointments for selected trainer or user's own appointments.

**On failure / error states:** Permission denied, no org selected, error message. Loading spinner while fetching.

---

## 2. How It Works

**Execution flow:**
1. Route guards check appointment_management:read permission
2. Component fetches user context and determines role (admin, staff, trainer, client)
3. Admin/staff can select trainer via sidebar; others see only own appointments
4. Query fetches appointments for selected trainer over 200-slot window
5. Appointments mapped to calendar format via mapApiAppointmentToCalendar utility
6. AppointmentList renders calendar with mapped appointments

**Inputs:**
- User role determines visibility (admin/staff see all, trainers see own, clients see their bookings)
- Sidebar selection: sidebarSelectedId (selected trainer ID)
- Query range: startFrom/startTo computed via getAppointmentQueryRange()

**State management:**
- TanStack Query: `["appointments", organizationId, selectedTrainerId, startFrom, startTo]` with staleTime: 60000ms
- Local state: sidebarSelectedId (for admin/staff trainer selection)
- Derived: selectedTrainerId = canViewAllTrainers ? sidebarSelectedId : memberId

**Outputs:**
- TrainerSidebar (if canViewAllTrainers): selectable trainer list
- AppointmentList: calendar grid with appointments, loading state, error message
- Responsive layout: sidebar 240px width (desktop), full width (mobile)

**Side effects:**
- Query refetch on trainer selection (via changed selectedTrainerId)
- Sidebar hidden for non-admin/staff (only client view)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.appointments.list()` — fetch appointments with trainerId, startFrom, startTo, limit filters

**Uses these components:**
- `TrainerSidebar` @ `/components/calendar/trainer-sidebar` — trainer selection (admin/staff only)
- `AppointmentList` @ `/components/appointments/appointment-list` — calendar rendering
- Responsive layout divs

**Uses these hooks:**
- `useUserContext()` — fetch org ID, member role, hierarchy
- `useQuery()` — fetch appointments
- `useMemo()` — map appointments to calendar format

**Navigation: who navigates here:**
- Appointment menu link

**Navigation: where it goes:**
- None explicit; likely links to class-slots or other appointment views

---

## 4. Data Shapes

**DB tables touched:**
- appointments — read
- members — read (implicit, via userContext hierarchy)

**Key types / Zod schemas:**
- API response: Array<{id, trainerId, startTime, endTime, clientId, status, ...}>
- Mapped output: Calendar-formatted appointments (structure determined by mapApiAppointmentToCalendar)
- Member hierarchy: {role: string (admin|staff|trainer|client), id: string}

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Role-based visibility enforcement (assumes API respects trainerId filter)
- Sidebar trainer list accuracy (depends on TrainerSidebar implementation)
- Query range boundaries (start/end date logic in getAppointmentQueryRange)
- AppointmentList rendering with large datasets (200-slot window is set but not stress-tested)
- Permission denied handling (should fail gracefully)

---

## 6. Notes

- **Role determination** — `memberRole.toLowerCase()` compared to string literals; assumes hierarchy always exists
- **Trainer sidebar hidden for non-admin/staff** — canViewAllTrainers checks role === "admin" or "staff" (line 33)
- **Query limit: 200 slots** — hardcoded; may need pagination for large organizations
- **staleTime: 60s** — appointments refreshed after 1 minute of inactivity
- **Query range** — computed via utility function; must verify it matches API expectations
- **Appointment mapping** — delegates to separate utility; structure depends on implementation

