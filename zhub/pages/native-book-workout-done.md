# Book Workout - Done Screen

**Route:** `(app)/dashboard/book-workout/done`
**File:** `apps/native/app/(app)/dashboard/book-workout/done.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** book-workout (step 4/4) — prev: review, terminal
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Success confirmation after booking creation. Shows booking details and exits the flow.

**Produces:** Success message + booking summary card (service, date/time, trainer, booking reference) + two action buttons.

**On success:** Always renders (only reached after appointment created successfully).

**On failure / error states:** None (terminal screen post-success).

---

## 2. How It Works

**Execution flow:**
1. Read `bookingId`, `bookingNumber` from route params
2. Read serviceName, startTime, trainerName from booking-flow-context
3. Display formatted summary
4. User clicks action → `reset()` context → `router.replace()` to home or bookings

**Inputs:**
- Route params: `bookingId?`, `bookingNumber?` (from Review screen)
- Context: serviceName, startTime, trainerName

**State management:** Calls `reset()` on navigation; no local state.

**Side effects:** Hides tab bar on focus; `reset()` clears entire booking-flow state.

---

## 3. What Depends On It

**Calls these API endpoints:** None (display-only terminal screen)

**Uses these components:**
- `Container` — `apps/native/components/container.tsx`
- `useBookingFlow` — `apps/native/contexts/booking-flow-context.tsx`

**Navigation: who navigates here:** Review screen after successful `appointments.create()`
**Navigation: where it goes:**
- "Back to Home" → `/dashboard` (replace)
- "View My Bookings" → `/dashboard/bookings` (replace)

---

## 4. Data Shapes

**DB tables touched:** None (read-only from context + route params)

**Helper functions:** `formatDateTime(isoString)` — ISO → "Tue, Apr 23 at 2:00 PM"

---

## 5. Tests

**Test files:** None found

**Not tested (risk areas):** bookingNumber optional; reset() timing; navigation fallback.

---

## 6. Notes

- booking reference shown only if `params.bookingNumber` provided.
- Uses `router.replace()` so back button won't return to this screen.
- All action buttons call `reset()` before navigating (enables fresh booking next time).
