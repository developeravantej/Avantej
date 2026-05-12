# Bookings List (Native)

**Route:** `/(app)/dashboard/bookings`
**File:** `apps/native/app/(app)/dashboard/bookings/index.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Shows the customer's upcoming and past workout bookings in two separate sections.
**Produces:** A scrollable list with an "Upcoming" section (confirmed/pending appointments) and a "Past" section (completed/cancelled/no-show), each showing image, type, date, time, location, and booking number. Includes a quick-link banner to the packages screen.
**On success:** Both sections render booking cards with "View details" and "Reschedule" (upcoming) or "View details" (past) action buttons.
**On failure / error states:** Skeleton cards during loading. Error inline message ("Unable to load") on query failure. Empty-state cards when no bookings exist. Full-page spinner while `organizationId` resolves.

---

## 2. How It Works

**Execution flow:**
```
BookingsScreen
  → useOrganization() → organizationId from OrganizationContext
  → useQuery(orpc.appointments.listForUser) [upcoming: status=confirmed, startFrom=now]
  → useQuery(orpc.appointments.listForUser) [past: startTo=now]
    → appointmentsRouter.listForUser
      → listAppointmentsForUser(tenantDb, { userId, startFrom/To })
        → appointments table (filtered by userId)
  → useMemo: filter upcomingList (confirmed|pending), pastList (completed|cancelled|no-show)
  → pull-to-refresh: invalidates all "appointments" queries
```

**Inputs:** None (no navigation params); `organizationId` sourced from context
**State management:**
- TanStack Query: two separate `listForUser` queries
- `queryClient.invalidateQueries` for pull-to-refresh (matches `queryKey[0] === "appointments"`)
**Outputs:** Renders booking cards; navigates to `/dashboard/bookings/[id]` on tap
**Side effects:** Pull-to-refresh invalidates both appointment queries

---

## 3. What Depends On It

**Calls these API endpoints:**
- `appointments.listForUser` — fetch upcoming (confirmed, startFrom=now, limit=10)
- `appointments.listForUser` — fetch past (startTo=now, limit=10)

**Uses these components:**
- `TabContainer` — `apps/native/components/container.tsx` — SafeAreaView for tab screens
- `useTabBarHeight` — `apps/native/components/container.tsx` — adds bottom padding to avoid tab bar overlap
- `SkeletonBox`, `BookingCardSkeleton`, `PastBookingCardSkeleton` — inline — loading placeholders

**Uses these hooks / contexts:**
- `useOrganization` — `apps/native/hooks/useOrganization.ts` — provides `organizationId`
- `orpc` — `apps/native/utils/orpc.ts` — oRPC client with auth headers

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/buy-package/done.tsx` — after purchase, "View Packages" button
- `apps/native/app/(app)/dashboard/notifications/index.tsx` — notification tap (no booking id)
- `apps/native/app/(app)/dashboard/book-workout/done.tsx` — "View My Bookings" button
- Tab bar — bookings tab

**Navigation: where it goes:**
- `/dashboard/bookings/[id]` — tap "View details" on any card
- `/dashboard/packages` — tap the "View My Packages & Credits" banner

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `appointments` | SELECT | `userId`, `status`, `startTime`, `duration`, `location`, `bookingNumber`, `imageUrl`, `type` |

**Key types:**
Appointment fields rendered: `id`, `type`, `startTime`, `duration`, `location`, `bookingNumber`, `imageUrl`, `status`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Client-side filter mismatch (upcoming query filtered server-side by `status=confirmed` but then also client-side filtered by `confirmed|pending`); "Reschedule" button has no `onPress` handler — it silently does nothing.

---

## 6. Notes

- The "Reschedule" button on upcoming cards renders but has no `onPress` — it is a visual placeholder with no functionality.
- The past query does NOT pass a `status` filter to the server; all appointments up to `now` are fetched and then client-side filtered to `completed|cancelled|no-show`. This means pending/confirmed past appointments (missed ones) are silently dropped.
- `queryKey[0] === "appointments"` predicate for cache invalidation is fragile — relies on oRPC internal key structure.
- The default fallback image is an Unsplash URL hardcoded in the component.
