# Book Workout — Done (Native)

**Route:** `/(app)/dashboard/book-workout/done`
**File:** `apps/native/app/(app)/dashboard/book-workout/done.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** book-workout (step 4/4) — prev: `/(app)/dashboard/book-workout/review`
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Step 4 (final) of the book-workout flow — confirms the booking was successful and shows a summary of what was booked.
**Produces:** A success screen with a checkmark icon, "Booking Confirmed!" heading, confirmation message, and a booking summary card (service, date/time, trainer, booking reference). Two sticky action buttons: "Back to Home" and "View My Bookings".
**On success:** Booking reference number and all details from context are visible.
**On failure / error states:** No failure states — this screen only renders after a successful create. If any context field is null it shows "N/A" or "Auto-assign".

---

## 2. How It Works

**Execution flow:**
```
DoneScreen
  → useLocalSearchParams: { bookingId?, bookingNumber? }
  → useBookingFlow() → state (serviceName, startTime, trainerName), reset()
  → handleBackToHome:
      reset() → clears BookingFlowContext
      router.replace("/dashboard")
  → handleViewBookings:
      reset() → clears BookingFlowContext
      router.replace("/dashboard/bookings")
  → useFocusEffect: hide tab bar
```

**Inputs:**
- Nav params: `bookingId` (unused in UI), `bookingNumber` (shown as Booking Reference)
- `BookingFlowContext.state`: `serviceName`, `startTime`, `trainerName`

**State management:** Read-only from context + nav params; no local state

**Outputs:** Static display; no mutations
**Side effects:**
- `reset()` clears `BookingFlowContext` on navigation away
- Hides tab bar via navigator traversal

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — SafeAreaView wrapper

**Uses these hooks / contexts:**
- `useBookingFlow` — `apps/native/contexts/booking-flow-context.tsx` — reads summary state, calls reset
- `useFocusEffect` — React Navigation — hide tab bar on focus

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/book-workout/review.tsx` — on successful `appointments.create` mutation

**Navigation: where it goes:**
- `/dashboard` — "Back to Home" button (`router.replace`)
- `/dashboard/bookings` — "View My Bookings" button (`router.replace`)
- Back arrow on header also calls `handleBackToHome` (resets context + replaces to dashboard)

---

## 4. Data Shapes

**DB tables touched:** None (read-only confirmation screen)

**Fields displayed from context:**
| Field | Source |
|-------|--------|
| Service | `state.serviceName ?? "N/A"` |
| Date & Time | `formatDateTime(state.startTime)` — formatted local datetime |
| Trainer | `state.trainerName ?? "Auto-assign"` |
| Booking Reference | `params.bookingNumber` (shown only if present) |

**`formatDateTime` output example:** `"Mon, Apr 21 at 10:00 AM"`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Context reset happens on navigation away — if the user backgrounds the app and returns, they are still on the Done screen; if they hit back, the reset has already happened and the summary may show "N/A".

---

## 6. Notes

- Uses `router.replace` (not `push`) so pressing back from Home or Bookings does not return to Done.
- The back arrow in the header also calls `handleBackToHome` (resets + replaces to `/dashboard`), not `router.back()`. This prevents returning to the Review screen after confirmation.
- `bookingId` param is received but not used in the UI (only `bookingNumber` is displayed).
- Tab bar is hidden here (flow-level consistency) even though no further flow steps exist; layout restores it when the entire book-workout stack is exited.
