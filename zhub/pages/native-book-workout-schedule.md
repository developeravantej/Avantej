# Book Workout — Schedule (Native)

**Route:** `/(app)/dashboard/book-workout/schedule`
**File:** `apps/native/app/(app)/dashboard/book-workout/schedule.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** book-workout (step 2/4) — prev: `/(app)/dashboard/book-workout/book-workout`, next: `/(app)/dashboard/book-workout/review`
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Step 2 of the book-workout flow — choose a date and time for the session. Private (1-on-1) bookings show a 7-day date strip and a static hourly time grid (8AM–7PM). Class (semi-private) bookings show a 7-day date strip and live class slots fetched from the API for the selected date.
**Produces:** A scrollable screen with a progress bar (50%), date picker strip, and time selection grid. A "Continue" button appears once both date and time are selected.
**On success:** Writes date/time/duration/classSlotId into `BookingFlowContext` and navigates to `./review`.
**On failure / error states:** Spinner while class slots load. Empty-state if no slots exist on selected date. "Please select a date first" placeholder before date is chosen. No error state shown on class slots fetch failure.

---

## 2. How It Works

**Execution flow:**
```
ScheduleScreen
  → useOrganization() → organizationId
  → useBookingFlow() → state.serviceType, state.serviceId, state.serviceDuration, update()
  → isPrivate = state.serviceType === "private"
  → [private path] static generateDates() + generatePrivateTimeSlots()
  → [class path] useQuery(orpc.classSlots.list, { serviceId, from, to })  [enabled when date selected]
    → classSlotsRouter.list
      → listClassSlots(tenantDb, { serviceId, from, to, accessibleNodeIds })
        → class_slots table
  → handleContinue:
      [private] parse time string → build ISO datetime
      [class] use selectedSlot.startTime
      update(BookingFlowState: date, startTime, duration, classSlotId)
      router.push("./review")
  → useFocusEffect: hide tab bar
```

**Inputs:** `BookingFlowContext.state.serviceType`, `state.serviceId`, `state.serviceDuration` (set in step 1)

**State management:**
- `viewMode`: "week" | "month" (local, UI only — month view has no different behavior)
- `selectedDate`: Date | null
- `selectedTime`: string | null (display format "H:MM AM/PM")
- `selectedClassSlotId`: string | null

**Outputs:** Updates `BookingFlowContext` with:
```
date: ISO date string (YYYY-MM-DD)
startTime: ISO datetime string
duration: state.serviceDuration ?? 60
classSlotId: string | null
```
**Side effects:** Hides tab bar via navigator traversal

---

## 3. What Depends On It

**Calls these API endpoints:**
- `classSlots.list` — fetch available class slots for selected date and serviceId (class path only)

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — SafeAreaView wrapper

**Uses these hooks / contexts:**
- `useBookingFlow` — `apps/native/contexts/booking-flow-context.tsx` — reads serviceType/serviceId, writes date/time
- `useOrganization` — `apps/native/hooks/useOrganization.ts` — provides `organizationId`
- `useFocusEffect` — React Navigation — hide tab bar on focus

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx` — "Continue" button

**Navigation: where it goes:**
- `./review` — on Continue
- `router.back()` — back arrow

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `class_slots` | SELECT | `id`, `startTime`, `capacity`, `currentBookings`, `status`, `serviceId`, `branchId` |

**Class slot display fields:** `startTime` → formatted time, `capacity - currentBookings` = spots left, `status === "cancelled"` → disabled

**Private time slots:** Static array 8:00 AM – 7:00 PM in 1-hour increments (12 slots)

**Time parsing:** `parseTime("10:00 AM")` → `[10, 0]` (24h); applied to `selectedDate` to build ISO datetime

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
- "Join waitlist" button renders but has no `onPress` handler — silently does nothing
- Month view toggle renders but produces no different behavior from week view
- `classSlots.list` requires `class_slot_management` read permission — a customer who is not a member will receive FORBIDDEN; this is likely a bug since the class schedule should be publicly visible to customers
- `state.serviceId` can be `null` if step 1 didn't set it; the class slots query passes `serviceId: null!` which may cause unexpected results

---

## 6. Notes

- The `classSlots.list` router currently requires `class_slot_management` read permission, which means only staff members can call it. Customer users will likely get a FORBIDDEN error on the class path. This appears to be a bug — the intent is for customers to view class availability.
- The 7-day window is always generated from `new Date()` at render time; the "month" view toggle changes state but has no distinct rendering logic.
- `branchId` is still not set in context at this step; it remains `null` going into Review.
