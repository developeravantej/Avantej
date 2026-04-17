# Book Workout — Review (Native)

**Route:** `/(app)/dashboard/book-workout/review`
**File:** `apps/native/app/(app)/dashboard/book-workout/review.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** book-workout (step 3/4) — prev: `/(app)/dashboard/book-workout/schedule`, next: `/(app)/dashboard/book-workout/done`
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Step 3 of the book-workout flow — review the booking summary (service, trainer, date/time, credits) before confirming.
**Produces:** A scrollable screen with a progress bar (75%), four summary cards (service, trainer, date/time, credits with package name), and a sticky "Confirm Booking" button.
**On success:** Calls `appointments.create`, invalidates appointment and package instance caches, navigates to `./done` with `bookingId` and `bookingNumber` as params.
**On failure / error states:** Button shows `ActivityIndicator` while mutation is pending (opacity 0.6). On error: `Alert.alert` with the error message. No retry mechanism.

---

## 2. How It Works

**Execution flow:**
```
ReviewScreen
  → useOrganization() → organizationId
  → useBookingFlow() → state (all fields from steps 1 & 2)
  → confirmMutation: client.appointments.create({
        organizationId,
        type: state.serviceType,
        startTime: state.startTime,
        duration: state.duration ?? 60,
        branchId: state.branchId!,   ← NOTE: null in current flow
        serviceId: state.serviceId,
        trainerId: state.trainerId,
        classSlotId: state.classSlotId,
        packageInstanceId: state.packageInstanceId,
        creditsUsed: 1,
        status: "confirmed",
        sessionTotal: 1,
        pricePerClient: 0,
      })
    → appointmentsRouter.create
      → requires appointment_management "create" permission
      → createAppointment(tenantDb, { ... })
        → appointments table INSERT
      → fire-and-forget Google Calendar sync (create)
  → on success: invalidate appointments + packageInstances queries
  → router.push("./done", { bookingId, bookingNumber })
  → useFocusEffect: hide tab bar
```

**Inputs:** All from `BookingFlowContext.state` — no user input on this screen

**State management:**
- TanStack Query mutation only
- Reads `BookingFlowContext.state` (read-only at this step)

**Outputs:** Creates appointment record; navigates to done screen
**Side effects:**
- `queryClient.invalidateQueries` for appointments (predicate JSON match)
- `queryClient.invalidateQueries` for packageInstances (predicate JSON match)
- Google Calendar sync fires asynchronously (create)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `appointments.create` — create the appointment record

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — SafeAreaView wrapper

**Uses these hooks / contexts:**
- `useBookingFlow` — `apps/native/contexts/booking-flow-context.tsx` — reads all booking state
- `useOrganization` — `apps/native/hooks/useOrganization.ts` — provides `organizationId`
- `client` — `apps/native/utils/orpc.ts` — oRPC mutation client

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/book-workout/schedule.tsx` — "Continue" button

**Navigation: where it goes:**
- `./done` with `{ bookingId, bookingNumber }` params — on confirm success
- `router.back()` — back arrow

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `appointments` | INSERT | `type`, `startTime`, `duration`, `branchId`, `serviceId`, `trainerId`, `classSlotId`, `packageInstanceId`, `creditsUsed`, `status`, `sessionTotal`, `pricePerClient`, `createdBy` |

**Appointment creation input (hardcoded values):**
- `creditsUsed: 1` — always 1 credit per session
- `sessionTotal: 1` — hardcoded
- `pricePerClient: 0` — always 0 (package-based, no direct charge)
- `status: "confirmed"` — immediately confirmed

**ServiceType normalization:** Both `"semi-private"` and `"semi_private"` (underscore variant) map to `"semi-private"` for the API call.

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
- `state.branchId!` is asserted non-null but is `null` throughout the flow — the `appointments.create` API requires a valid UUID for `branchId`; this will cause a validation error at runtime
- No check that `state.startTime` is non-null before calling create
- The `appointments.create` router requires `appointment_management` create permission — customer users without that permission will receive FORBIDDEN

---

## 6. Notes

- **Critical bug:** `branchId` is never set during the booking flow (always `null`) but is passed as `state.branchId!` to the create call. The API's Zod schema requires a UUID string. This will cause a runtime error unless the API has been modified to make `branchId` optional.
- Credits deduction from the package instance is not handled in the appointments router — it should be handled either here or in the service layer.
- `sessionTotal: 1` and `pricePerClient: 0` are hardcoded; the UI says "1 credit will be deducted" which is always correct for this flow.
