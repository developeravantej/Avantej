# Booking Detail (Native)

**Route:** `/(app)/dashboard/bookings/[id]`
**File:** `apps/native/app/(app)/dashboard/bookings/[id].tsx:1`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Shows full details of a single booking and allows cancellation of upcoming confirmed bookings.
**Produces:** A detail view with booking image, title, status badge, date/time/duration/price info cards, credits used, location, cancellation reason (if cancelled), description, and notes. A sticky "Cancel Booking" button appears at the bottom for upcoming confirmed appointments.
**On success:** All booking fields render. Cancel triggers an `Alert` confirmation, then mutates status to `cancelled` and navigates back.
**On failure / error states:** Full-page spinner while loading. "Booking not found" screen with "Go Back" button on error or 404. Cancel button shows `ActivityIndicator` while mutation is pending.

---

## 2. How It Works

**Execution flow:**
```
BookingDetailScreen
  → useLocalSearchParams: { id }
  → useOrganization() → organizationId
  → useQuery(orpc.appointments.getById, { organizationId, id })
    → appointmentsRouter.getById
      → getAppointmentById(tenantDb, id)
        → appointments table
  → cancelMutation: client.appointments.update({ status: "cancelled" })
    → appointmentsRouter.update
      → updateAppointment(tenantDb, id, { status: "cancelled", cancellationReason: "Cancelled by client" })
        → appointments table
      → fire-and-forget Google Calendar sync (delete action)
  → on cancel success: invalidate all appointment queries, router.back()
  → useFocusEffect + useEffect: hide tab bar on mount/focus, restore on unmount/blur
```

**Inputs:** Navigation param `id` (appointment UUID)
**State management:**
- TanStack Query: `getById` query, `update` mutation
- Tab bar visibility managed via `useNavigation` + traversal up to the Tabs navigator
**Outputs:** Renders appointment detail; mutation sets status to `cancelled`
**Side effects:**
- On cancel success: `queryClient.invalidateQueries` (predicate matches `"appointments"` in key JSON)
- Google Calendar sync fires asynchronously on cancel (delete)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `appointments.getById` — load appointment detail
- `appointments.update` — cancel appointment (status = "cancelled")

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — SafeAreaView wrapper

**Uses these hooks / contexts:**
- `useOrganization` — `apps/native/hooks/useOrganization.ts` — provides `organizationId`
- `useNavigation` — React Navigation — for tab bar hide/show
- `useFocusEffect` — React Navigation — run side effects on screen focus/blur
- `client`, `orpc` — `apps/native/utils/orpc.ts` — oRPC client

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/bookings/index.tsx` — "View details" button on any card
- `apps/native/app/(app)/dashboard/index.tsx` — upcoming activity card tap
- `apps/native/app/(app)/dashboard/notifications/index.tsx` — notification with booking id
- `apps/native/app/(app)/dashboard/packages/index.tsx` — linked appointment tap

**Navigation: where it goes:**
- `router.back()` — after cancel success, or "Go Back" on error

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `appointments` | SELECT | `id`, `status`, `startTime`, `endTime`, `duration`, `type`, `location`, `bookingNumber`, `imageUrl`, `description`, `notes`, `cancellationReason`, `creditsUsed`, `sessionTotal`, `pricePerClient`, `userId`, `branchId` |
| `appointments` | UPDATE | `status`, `cancellationReason`, `cancelledAt` |

**Key derived values:**
- `isUpcoming`: `status === "confirmed" && startTime > now` — controls whether Cancel button renders
- `price`: `sessionTotal` if present, else `pricePerClient`, formatted as `$X.XX`
- `title`: `bookingNumber ?? type ?? "Appointment"`

**Status color mapping:**
| Status | Background | Text |
|--------|-----------|------|
| confirmed | `#DCFCE7` | `#16A34A` |
| completed | `#E0E7FF` | `#4F46E5` |
| cancelled | `#FEE2E2` | `#EF4444` |
| no_show | `#FEF3C7` | `#D97706` |

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Tab bar hide/show via navigator traversal (fragile); cancel mutation `onError` does not show the user an error (only logs); status value `"no-show"` (hyphen) vs `"no_show"` (underscore) — router schema uses `"no-show"` but `getStatusColors` handles `"no_show"`.

---

## 6. Notes

- Tab bar hiding uses a manual traversal of the navigator tree (up to depth 5) — fragile if the navigation structure changes.
- Both `useFocusEffect` and `useEffect` are used to hide the tab bar to handle race conditions; cleanup restores the tab bar.
- Clients can only set status to `"cancelled"` via the update procedure — any other status change is forbidden with a `FORBIDDEN` error.
- The `cancellationReason` is auto-set to `"Cancelled by client"` server-side when `status === "cancelled"` and no reason is provided.
