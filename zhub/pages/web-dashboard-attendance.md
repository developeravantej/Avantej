# Attendance Management

**Route:** `/dashboard/attendance/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/attendance/view.tsx`
**Platform:** web
**Auth required:** authenticated (RBAC checked in component via hasPermission)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Check in members and walk-ins for today's sessions, view check-in history, and record drop-in attendance.

**Produces:**
- **Left column (main):** Today's Bookings section (members with bookings) and Check-ins Log (all check-ins for the day)
- **Right column (sidebar):** Drop-in Form to register walk-in check-ins
- Top filters: Branch selector, date picker
- Loading/error states with retry button

**On success:** Check-in recorded, booking status updated, log displays with total count. Drop-in check-ins added to log.

**On failure / error states:** Permission denied (hasPermission check), no branch selected, loading spinner, error callout with retry, error toasts.

---

## 2. How It Works

**Execution flow:**
1. Route loads with no explicit guard (relying on component-level RBAC checks)
2. Component derives accessible branches from userContext hierarchy (node type === "branch")
3. Default to first accessible branch; user can switch via Select
4. Date defaults to today; user can pick any date (YYYY-MM-DD format)
5. Two queries fire: listTodaysBookings and checkIns.list (from/to date range)
6. TodayBookingsSection renders bookings with attendance status
7. DropInForm lets user add walk-in check-ins (mutations handled by component)
8. CheckInsLog shows all check-ins for selected date with delete capability (if canDelete)

**Inputs:**
- Branch filter: branchId (from accessible branches)
- Date picker: date (YYYY-MM-DD, local date string)
- Drop-in form: inputs determined by DropInForm component

**State management:**
- TanStack Query: `["attendance", "bookings", organizationId, branchId, date]`, `["attendance", "checkIns", organizationId, branchId, date]`
- Local state: branchId, date, canRead, canDelete (RBAC checks)
- Query keys passed to child components for cache management

**Outputs:**
- Grid layout: two-column desktop (TodayBookingsSection + DropInForm), single-column mobile
- TodayBookingsSection: member cards with check-in status
- CheckInsLog: table of check-ins with delete action (conditional on canDelete)
- DropInForm: form for adding walk-ins (query key passed for invalidation)
- Loading spinners and error callouts with manual refetch

**Side effects:**
- Branch/date changes trigger query refetch (via queryKey dependency)
- Check-in deletion refreshes checkIns query (handled by CheckInsLog component)
- Permission checks prevent rendering if canRead is false

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.checkIns.listTodaysBookings()` — fetch bookings for branch + date
- `client.checkIns.list()` — fetch check-ins log for date range (from/to)

**Uses these components:**
- `TodayBookingsSection` @ `/components/attendance/today-bookings` — bookings display
- `DropInForm` @ `/components/attendance/drop-in-form` — walk-in check-in form
- `CheckInsLog` @ `/components/attendance/check-ins-log` — check-in history
- Select, Input (date), Label, Separator, StatusCallout

**Uses these hooks:**
- `useUserContext()` — fetch org ID, accessible branches, RBAC perms
- `useQuery()` — fetch bookings and check-ins
- `useState()` — manage branch/date filters and RBAC flags

**Navigation: who navigates here:**
- Attendance menu link

**Navigation: where it goes:**
- None explicit

---

## 4. Data Shapes

**DB tables touched:**
- appointments/bookings — read (via checkIns.listTodaysBookings)
- check_ins — read
- members — read (implicit, for member info in bookings/check-ins)

**Key types / Zod schemas:**
- `TodaysBookingRow` — {id, memberId, memberName, appointmentId, status, ...} (defined in component import)
- `CheckInRow` — {id, memberId, name, email, phone, checkInTime, ...} (defined in component import)
- Query result: `{rows: CheckInRow[], total: number}`
- Hierarchy nodes: `{id, name, type: "branch"|..., depth, ...}`

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Permission caching (hasPermission may be stale)
- Date string formatting edge cases (no date-fns; manual YYYY-MM-DD logic)
- Concurrent check-in submissions (race conditions)
- Large branch lists (branch selector renders all accessible branches)
- Timezone handling (date picker is naive; may have DST issues)
- CheckInsLog delete callback chain (assumes query invalidation works)
- DropInForm mutation success flow (component handles internally)

---

## 6. Notes

- **Manual date formatting** — toLocalDateString() implemented without date-fns (lines 32-37) to avoid dependencies
- **Accessible branches derived from hierarchy** — filters nodes where type === "branch" and id in accessibleNodeIds; falls back to all accessible nodes if no branch nodes
- **Permission checks done in component** — no route-level guard; canRead/canDelete checked before rendering sections
- **Two separate queries** — bookings and check-ins; implies different endpoints or parameters
- **Date range for check-ins** — constructed with hard T00:00:00 and T23:59:59 suffixes (line 129-130); may miss edge cases at midnight
- **Branch selector is required** — page shows placeholder div if !branchId; user must select branch
- **Drop-in form side panel** — 360px fixed width on desktop, full-width on mobile (lg:grid-cols-[1fr_360px])
- **CheckInsLog canDelete prop** — passed from component; respects RBAC check

