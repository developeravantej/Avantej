# Booking Details & Cancellation

**Route:** `(app)/dashboard/bookings/:id`
**File:** `apps/native/app/(app)/dashboard/bookings/[id].tsx`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Displays full booking details (date, time, price, credits, description, notes) and allows cancellation of future confirmed bookings.
**Produces:** Full-screen card with image, status badge, info boxes, description/notes sections. Conditionally shows cancel button for upcoming bookings.
**On success:** Booking data loads and renders; user can cancel with confirmation alert.
**On failure / error states:** "Booking not found" + back button; loading spinner while fetching.

---

## 2. How It Works

**Execution flow:**
1. Extract `id` from route params via `useLocalSearchParams()`
2. Get `organizationId` from `useOrganization()` hook
3. Query booking detail: `orpc.appointments.getById({ organizationId, id })`
4. Determine if upcoming: `status === "confirmed" && startTime > now`
5. Hide tab bar on mount (via navigation hook recursion)
6. Render scrollable detail view with all fields
7. If upcoming: show cancel button
8. On cancel press: show alert confirmation
9. On confirm: `client.appointments.update({ organizationId, id, status: "cancelled" })`
10. On success: invalidate appointments queries + navigate back

**Inputs:** Route param `id` (appointmentId)
**State management:**
- TanStack Query: `appointment` query
- `useRef` to track tab bar visibility state
- Tab bar state managed by finding and calling parent navigator's `setOptions()`
**Outputs:** Scrollable Container with detail cards
**Side effects:** Tab bar hidden on focus, shown on blur; cancel mutation navigates back

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.appointments.getById` — fetches single appointment detail
- `client.appointments.update` (mutation) — cancels appointment
**Uses these components:**
- `Container` (path: `@/components/container`) — root layout
- `SafeAreaView` (path: `react-native-safe-area-context`) — bottom button safe area
**Uses these hooks:**
- `useOrganization()` — provides organizationId
- `useFocusEffect()`, `useNavigation()` — tab bar visibility control
- `useQuery()`, `useMutation()`, `useQueryClient()` — data + mutations
- `useLocalSearchParams()` — route param parsing
**Navigation: who navigates here:** From `/dashboard/bookings` card tap or notification
**Navigation: where it goes:** Back to `/dashboard/bookings` on successful cancel

---

## 4. Data Shapes

**DB tables touched:** `appointments` (tenantDb, read)
**Key types / Zod schemas:**
Input to `getById`:
```
{
  organizationId: string
  id: string (appointmentId)
}
```
Input to `update` (cancel):
```
{
  organizationId: string
  id: string
  status: "cancelled"
}
```
Appointment object (full):
```
{
  id: string
  type: string
  status: "confirmed" | "completed" | "cancelled" | "no-show" | "pending"
  startTime: ISO string
  endTime?: ISO string
  duration?: number
  imageUrl?: string
  location?: string
  bookingNumber?: string
  sessionTotal?: number | Decimal
  pricePerClient?: number | Decimal
  creditsUsed?: number | Decimal
  description?: string
  notes?: string
  cancellationReason?: string
}
```

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):**
- Tab bar visibility logic (recursively finds parent navigator—fragile)
- Cancel mutation error handling (error alert not shown)
- Race condition: user navigates back before cancel completes
- Date comparison for "is upcoming" (timezone issues possible)
- Decimal types for price/credits (JS number conversion may lose precision)

---

## 6. Notes

- Tab bar hiding uses complex recursion to find tabs navigator—tightly coupled to navigation structure.
- Cancel confirmation uses native Alert (platform-specific behavior).
- Cancel button only shows if `status === "confirmed"` AND date is in future—excludes pending.
- Price display prefers `sessionTotal` over `pricePerClient`—ensure backend returns both or one consistently.
- Cancellation reason displayed in red error-style box (UX is consistent but uses error colors for info).
- No undo after cancel—cache invalidation is aggressive (may re-fetch unnecessarily).
