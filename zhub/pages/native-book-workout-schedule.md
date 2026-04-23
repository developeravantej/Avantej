# Book Workout - Schedule Screen

**Route:** `(app)/dashboard/book-workout/schedule`
**File:** `apps/native/app/(app)/dashboard/book-workout/schedule.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** book-workout (step 2/4) — prev: book-workout, next: review
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** User picks a date and time slot. Private services show a time grid; class services show available class slots.

**Produces:**
- Horizontal date picker (next 7 days)
- Private: time grid (8 AM–7 PM, 12 slots)
- Class: slot grid from API (shows capacity / spots remaining)

**On success:** Continue button enables when date + time selected → advances to Review.

**On failure / error states:**
- No date selected: "Please select a date first"
- Class slots loading: activity indicator
- No available slots: "No available slots for this date"
- Full slot: button disabled, "Full" label shown

---

## 2. How It Works

**Execution flow:**
1. Render date picker (7 days from today, generated client-side)
2. If private: show static time grid (8 AM–7 PM)
3. If class: fetch `orpc.classSlots.list()` for selected date
4. User selects date + time → Continue enables
5. Continue → update context with date/time/duration/classSlotId → push to review

**Inputs:**
- `organizationId` from `useOrganization()`
- `state` from booking-flow-context (serviceType, serviceId from previous step)

**State management:**
- Local: `selectedDate`, `selectedTime`, `selectedClassSlotId`, `viewMode`
- Query keys: `classSlots.list({ organizationId, serviceId, from, to })` — enabled when class mode + date selected
- Context: updates booking-flow with date, startTime, duration, classSlotId

**Side effects:** Hides tab bar on focus.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.classSlots.list({ organizationId, serviceId, from: dateISO, to: nextDayISO })` — class slots only

**Navigation: who navigates here:** Setup screen via `router.push("./schedule")`
**Navigation: where it goes:** Continue → `./review`

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns |
|-------|-----------|-------------|
| `classSlots` | READ | startTime, capacity, currentBookings, status |

**Helper functions:** `generateDates()` (next 7 days), `generatePrivateTimeSlots()` (8 AM–7 PM), `parseTime()`, `formatTime()`

---

## 5. Tests

**Test files:** None found

**Not tested (risk areas):**
- Private time slots hardcoded to 8 AM–7 PM (no service hours config)
- Timezone handling (local dates sent without explicit timezone)
- Spot calculation assumes currentBookings always defined
- Waitlist button visible but no handler wired

---

## 6. Notes

- Private time slots are generated entirely client-side — no availability API call.
- View mode toggle (Week/Month) renders but doesn't affect date picker logic (cosmetic only).
- Spot calc: `capacity - (currentBookings ?? 0)` — defaults to full capacity if missing.
