# Calendar Screen

**Route:** `(app)/dashboard/calendar`
**File:** `apps/native/app/(app)/dashboard/calendar/index.tsx`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View a calendar of scheduled sessions, select a date to see bookings for that day, and manage upcoming appointments.
**Produces:** Interactive calendar showing marked dates with appointments; selected date expanded to show all bookings for that day with time, credits, type (personal/class), location.
**On success:** Calendar loads, displays dots on dates with appointments, user can select any date to view bookings.
**On failure / error states:** Loading spinner during fetch; "No Bookings" empty state when selected date has no appointments; error message if query fails.

---

## 2. How It Works

**Execution flow:**
1. Initializes selectedDate to today, currentMonth to current year-month
2. Computes monthStart/monthEnd ISO strings for month boundary query
3. Queries `orpc.appointments.listForUser` with organizationId, startFrom/startTo month boundaries
4. Derives markedDates: loops through appointments, marks each date with dot, adds selected color to selectedDate
5. Derives selectedDateBookings: filters appointments by selectedDate, maps to UI structure (time, credits, icon, etc.)
6. useFocusEffect hides tab bar when screen focused (searches parent navigator tree up to 5 levels)
7. Pull-to-refresh calls refetch()

**Inputs:** organizationId (from context), selectedDate (YYYY-MM-DD), currentMonth (YYYY-MM)
**State management:** Local state for selectedDate, currentMonth; TanStack Query for appointments list
**Outputs:** Calendar UI with marked dates; filtered booking list for selected date; tab bar hidden
**Side effects:** Tab navigator option setOptions to hide tab bar; router.back() on header back button

---

## 3. What Depends On It

**Calls these API endpoints:** `orpc.appointments.listForUser` — fetch all appointments in current month (organizationId, startFrom, startTo)
**Uses these components:** Container, ScrollView, Calendar (react-native-calendars), RefreshControl, Ionicons, TouchableOpacity, ActivityIndicator, View, Text
**Uses these hooks:** `useNavigation()` (to find and hide tab bar), `useOrganization()` (orgId), `useQuery()` (appointments), `useCallback()`, `useMemo()`, `useState()`
**Navigation: who navigates here:** Dashboard actions button, or direct route `/dashboard/calendar`
**Navigation: where it goes:** Back to previous screen via router.back()

---

## 4. Data Shapes

**DB tables touched:** appointments (select id, startTime, type, location, creditsUsed, status; filtered by organizationId, date range)

**Key types / Zod schemas:**
- selectedDate: string (YYYY-MM-DD format from useLocalSearchParams)
- currentMonth: string (YYYY-MM format, initialized as `${year}-${month}`)
- appointments response: array of { id, startTime, type ('private'|'class'), location?, creditsUsed, status }
- markedDates: Record<string, { marked, dotColor, selected?, selectedColor }>
- selectedDateBookings: array of { id, name, time (formatted HH:MM AM/PM), credits, icon ('person'|'people'), location?, status }

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):**
- Tab navigator search recursion (depth limit 5) — may fail on non-standard nav structures
- Month boundary edge cases (Feb 28/29, month transitions)
- Multiple appointments on same date sorting/ordering
- Calendar theme prop handling for custom colors
- Scroll-to behavior when selecting dates near bottom

---

## 6. Notes

- Calendar uses react-native-calendars library with custom theme (colors.primary and colors.secondary)
- Tab bar hiding logic is complex: traverses parent navigator chain to find tab navigator, then calls setOptions
- Tab bar NOT restored in cleanup (comment says layout handles it when leaving entire stack)
- selectedDateBookings filters by exact YYYY-MM-DD match; works correctly across timezones if all times ISO
- Date formatting: `new Date(apt.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })`
- Booking type determines icon: 'private' → person, 'class' → people; credits shown per booking
- Location is optional field; only rendered if present
