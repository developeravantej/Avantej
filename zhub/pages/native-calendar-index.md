# Calendar (Native)

**Route:** `/(app)/dashboard/calendar`
**File:** `apps/native/app/(app)/dashboard/calendar/index.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Shows a full-month calendar with dots marking days that have bookings, and lists the bookings for any selected day.
**Produces:** A scrollable screen with a `react-native-calendars` Calendar component (dots on booked days, selected day highlighted) and a booking list below showing each session's name, time, credits, location, and icon. Pull-to-refresh refetches appointments for the current month.
**On success:** Calendar shows dot markers on booked dates; tapping a date shows that day's bookings below. Navigation back button exits the screen.
**On failure / error states:** Full-page spinner while data loads initially. No distinct error state — if the query fails the calendar shows no dots and the day list shows "No Bookings" for every date.

---

## 2. How It Works

**Execution flow:**
```
CalendarScreen
  → useOrganization() → organizationId
  → state: selectedDate (today's ISO date), currentMonth (YYYY-MM)
  → compute monthStart / monthEnd ISO strings from currentMonth
  → useQuery(orpc.appointments.listForUser, { organizationId, startFrom: monthStart, startTo: monthEnd })
    → appointmentsRouter.listForUser
      → listAppointmentsForUser(tenantDb, { userId: session.user.id, startFrom, startTo })
        → appointments table (filtered by userId + date range)
  → markedDates: derive { [YYYY-MM-DD]: { marked, dotColor } } from appointments
  → selectedDateBookings: filter appointments by selectedDate, map to display shape
  → Calendar.onMonthChange → update currentMonth → refetch with new date range
  → Calendar.onDayPress → update selectedDate
  → pull-to-refresh → refetch()
  → useFocusEffect: hide tab bar
```

**Inputs:** None (no navigation params); driven by user date selection

**State management:**
- `selectedDate`: string (YYYY-MM-DD, init = today)
- `currentMonth`: string (YYYY-MM, init = current month)
- TanStack Query: single `listForUser` query, refetched when `currentMonth` changes

**Outputs:** Renders calendar + booking list for selected day; no mutations
**Side effects:**
- Tab bar hidden via navigator traversal on focus
- Month navigation triggers new API query via `currentMonth` state change

---

## 3. What Depends On It

**Calls these API endpoints:**
- `appointments.listForUser` — fetch all user appointments in the visible month

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — SafeAreaView wrapper
- `Calendar` — `react-native-calendars` — full calendar UI with dot markings

**Uses these hooks / contexts:**
- `useOrganization` — `apps/native/hooks/useOrganization.ts` — provides `organizationId`
- `useNavigation`, `useFocusEffect` — React Navigation — hide tab bar on focus
- `orpc` — `apps/native/utils/orpc.ts` — oRPC query client

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/index.tsx` — calendar icon button in the dashboard header

**Navigation: where it goes:**
- `router.back()` — back arrow in header

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `appointments` | SELECT | `id`, `type`, `startTime`, `creditsUsed`, `location`, `status`, `userId` |

**Booking display shape (derived):**
```typescript
{
  id: string
  name: "Personal Training" | "Class Session"   // derived from type
  time: string   // e.g. "10:00 AM"
  credits: number  // apt.creditsUsed ?? 1
  icon: "person" | "people"   // derived from type
  location?: string
  status: string
}
```

**`markedDates` shape for `react-native-calendars`:**
```typescript
{
  [YYYY-MM-DD]: {
    marked?: true,
    dotColor?: string,
    selected?: true,
    selectedColor?: string
  }
}
```

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
- Month boundary handling: `monthEnd` uses `new Date(y, m, 0).getDate()` which correctly gets last day of month
- Timezone mismatch: `startTime` is stored as UTC; converting to local date key may shift dates near midnight
- No error state UI — a failed query silently shows empty calendar

---

## 6. Notes

- The month query fetches all appointments in the month without a status filter — cancelled and no-show appointments also appear as dots on the calendar.
- Booking type label is purely derived from `apt.type` ("private" → "Personal Training", anything else → "Class Session"); the actual service name is not fetched here.
- Tab bar is hidden on focus but not restored in the cleanup function — the layout handles restoration when navigating away from the calendar sub-stack.
- The `refetch` function from `useQuery` is passed directly to `RefreshControl.onRefresh` — there is no manual `isRefreshing` state; `isRefetching` from the query is used instead, which is the correct pattern.
