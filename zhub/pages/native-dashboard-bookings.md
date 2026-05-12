# My Bookings List

**Route:** `(app)/dashboard/bookings`
**File:** `apps/native/app/(app)/dashboard/bookings/index.tsx`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Lists all upcoming and past bookings, organized by status. Users can view details and reschedule upcoming appointments.
**Produces:** Two sections (Upcoming, Past), each with status-filtered appointment cards showing image, date, time, location, and action buttons.
**On success:** Pull-to-refresh fetches latest bookings; cards display with images and metadata.
**On failure / error states:** Error message shown per section; pull to retry. Loading skeletons while fetching.

---

## 2. How It Works

**Execution flow:**
1. Get `organizationId` from `useOrganization()` hook
2. Query upcoming bookings: `orpc.appointments.listForUser({ organizationId, status: "confirmed", startFrom: now, limit: 10 })`
3. Query past bookings: `orpc.appointments.listForUser({ organizationId, startTo: now, limit: 10 })`
4. Filter locally: upcoming (confirmed/pending), past (completed/cancelled/no-show)
5. Render cards with image, type, date, time, location, booking number
6. On pull-to-refresh: invalidate "appointments" query key
7. On card tap: navigate to `/dashboard/bookings/[id]`
8. On "Reschedule" button: (button exists but handler not implemented)

**Inputs:** None (organization context)
**State management:**
- TanStack Query: `upcomingBookings`, `pastBookings` queries
- Pull-to-refresh state managed by RefreshControl
- TabBar height from `useTabBarHeight()` hook
**Outputs:** Scrollable TabContainer with card list
**Side effects:** Navigation to booking detail on card press; query invalidation on refresh

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.appointments.listForUser` (called twice: upcoming + past) — fetches booking records
**Uses these components:**
- `TabContainer` & `useTabBarHeight` (path: `@/components/container`) — layout wrapper with tab bar awareness
**Uses these hooks:**
- `useOrganization()` — provides organizationId
- `useQuery()`, `useQueryClient()` from TanStack Query
**Navigation: who navigates here:** Tab navigator (bookings tab)
**Navigation: where it goes:** `/dashboard/bookings/[id]` (on card tap)

---

## 4. Data Shapes

**DB tables touched:** `appointments` (tenantDb, read-only)
**Key types / Zod schemas:**
Input to `listForUser`:
```
{
  organizationId: string
  status?: "confirmed" | "completed" | "cancelled" | "no-show" | "pending"
  startFrom?: ISO string (filters appointments after this date)
  startTo?: ISO string (filters appointments before this date)
  limit?: number
}
```
Appointment object returned:
```
{
  id: string
  type: string (e.g., "Yoga", "PT Session")
  status: "confirmed" | "pending" | "completed" | "cancelled" | "no-show"
  startTime: ISO string
  endTime?: ISO string
  duration: number (minutes)
  imageUrl?: string
  location?: string
  bookingNumber?: string
}
```

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):** 
- Error state recovery (user must manually pull to retry)
- "Reschedule" button functionality (no handler attached)
- Edge case: appointment times exactly at "now"
- Multi-org handling if user switches orgs mid-scroll

---

## 6. Notes

- Query is split into two calls (upcoming/past) rather than fetched all then filtered—reduces payload.
- Pull-to-refresh only invalidates "appointments" key prefix—catches both queries.
- Card layout mirrors past/upcoming (image + details + actions), but past section only shows "View Details" button.
- Package/credit link hardcoded to `/dashboard/packages`—good UX but assumes packages screen exists.
- Skeleton cards use `animate-pulse` class—requires Tailwind animation support.
- No pagination; limit=10 per section—may need pagination if user has many bookings.
