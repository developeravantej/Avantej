# Book Workout - Review Screen

**Route:** `(app)/dashboard/book-workout/review`
**File:** `apps/native/app/(app)/dashboard/book-workout/review.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** book-workout (step 3/4) — prev: schedule, next: done
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Final confirmation summary before creating appointment. Shows service, trainer, date/time, and credits to be deducted.

**Produces:** Booking summary card with service name, trainer, date/time, package name, and 1 credit deduction label.

**On success:** Confirm Booking creates appointment → navigates to Done with booking reference.

**On failure / error states:** Alert dialog "Booking Failed" with error message; button disabled during pending.

---

## 2. How It Works

**Execution flow:**
1. Display summary from booking-flow-context
2. Confirm Booking → `confirmMutation.mutate()`
3. Calls `client.appointments.create()` with booking data
4. On success: invalidate appointments + packageInstances queries, navigate to Done

**Inputs:**
- `organizationId` from `useOrganization()`
- `state` from booking-flow-context (serviceName, trainerName, startTime, serviceType, packageInstanceId, branchId)

**State management:**
- Local: none (reads context)
- Mutation: `client.appointments.create()`
- On success: invalidate query patterns "appointments" and "packageInstances"

**Outputs:**
- Mutation payload: `{ organizationId, type, startTime, duration, branchId, serviceId?, trainerId?, classSlotId?, packageInstanceId?, creditsUsed: 1, status: "confirmed", sessionTotal: 1, pricePerClient: 0 }`
- On confirm: navigate to Done with `{ bookingId, bookingNumber }`

**Side effects:** Hides tab bar on focus; Alert on error.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.appointments.create({ organizationId, type, startTime, duration, branchId, ... })` — creates appointment + deducts credit

**Navigation: who navigates here:** Schedule screen via `router.push("./review")`
**Navigation: where it goes:** Confirm (success) → `./done` with params; Back → previous screen

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns |
|-------|-----------|-------------|
| `appointments` | WRITE | type, startTime, duration, branchId, serviceId, trainerId, classSlotId, packageInstanceId, creditsUsed, status |

---

## 5. Tests

**Test files:** None found

**Not tested (risk areas):**
- `branchId` is always `state.branchId!` (non-null assertion) but initialized as null in context — API may fail
- serviceType normalization ("semi_private" vs "semi-private") inconsistency
- Cache invalidation is broad (pattern match affects unrelated queries)

---

## 6. Notes

- `branchId` is a required API field but booking-flow-context initializes it as null — likely causes API failures in production.
- `creditsUsed` hardcoded to 1; assumes all sessions use exactly 1 credit.
- `pricePerClient` hardcoded to 0 — cost absorbed by package.
- No confirmation dialog before booking; Confirm button directly fires mutation.
