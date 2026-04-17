# Native Dashboard Home

**Route:** `/(app)/dashboard/` (tab index screen)
**File:** `apps/native/app/(app)/dashboard/index.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** The main home screen of the customer mobile app; shows the user's active fitness package status, upcoming appointment, recent activity, and quick-action buttons.
**Produces:** A scrollable feed: greeting card with notification badge, active package card with credit progress bar, quick-insight card, four action shortcuts, "UP NEXT" upcoming appointment, and "RECENT ACTIVITY" list.
**On success:** All sections populate from live API data; pull-to-refresh reloads everything.
**On failure / error states:** Each section renders an independent inline error message. Global org-loading shows a full-screen ActivityIndicator. Skeleton loaders shown for package card and upcoming section while loading.

---

## 2. How It Works

**Execution flow:**
```
Home screen
  → useAuth()                            # gets user name
  → useOrganization()                    # gets organizationId
  → orpc.packageInstances.getActiveForClient.queryOptions(...)
      → packageInstancesRouter.getActiveForClient
        → listPackageInstancesForClient(tenantDb, { clientId, status:"active", limit:1 })
          → package_instances table
  → orpc.notifications.getUnreadCount.queryOptions(...)
      → notificationsRouter.getUnreadCount
        → getUnreadCount(tenantDb, userId)
  → orpc.appointments.listForUser.queryOptions({ status:"confirmed", startFrom:now, limit:1 })
      → appointmentsRouter.listForUser  # upcoming
        → appointments table (with service join)
  → orpc.appointments.listForUser.queryOptions({ limit:5 })
      → appointmentsRouter.listForUser  # recent
        → appointments table
```

**Inputs:** None from URL/navigation. All data from session user + organizationId.
**State management:**
- 4 TanStack Query queries (packageInstances, notifications, upcoming appointments, recent appointments)
- `queryClient.invalidateQueries` on pull-to-refresh for keys: `packageInstances`, `appointments`, `notifications`
- Notifications polled every 30 seconds (`refetchInterval: 30000`)

**Outputs:**
- Greeting card: user name (from `user.firstName` or `user.name`), current date, notification bell with unread badge
- Package card: plan label "ACTIVE", credits remaining (large display), progress bar (% used), estimated weeks to finish, renewal date, "Manage membership" link
- No-plan state: empty card with "Browse Packages" CTA
- Quick-insight card (only when plan active): hardcoded tip text
- Action grid (4 buttons): Book Session, Calendar, Buy Package, My Credits
- UP NEXT: next confirmed appointment image/title/time, tappable to booking detail
- RECENT ACTIVITY: last 5 appointments with status icon and credit deduction

**Side effects:** None (read-only screen).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `packageInstances.getActiveForClient` — returns single active package instance for session user
- `notifications.getUnreadCount` — returns integer count, polled every 30s
- `appointments.listForUser` (×2) — upcoming (status:confirmed, limit:1) and recent (limit:5)

**Uses these components:**
- `TabContainer` — `apps/native/components/container` — wraps tab screens with safe area + tab-bar padding
- `useTabBarHeight` — `apps/native/components/container` — returns dynamic tab bar height for bottom padding
- `SkeletonBox`, `PlanCardSkeleton`, `UpcomingSkeleton` — inline local skeleton components

**Uses these hooks:**
- `useAuth` — `apps/native/hooks/useAuth` — provides `user`
- `useOrganization` — `apps/native/hooks/useOrganization` — provides `organizationId`, `isLoading`
- `useQuery`, `useQueryClient` — TanStack Query
- `useCallback`, `useMemo` — memoized refresh + derived data

**Navigation: who navigates here:** Tab bar (index tab). Expo Router renders this as the default dashboard tab.
**Navigation: where it goes:**
- `/dashboard/notifications/` — notification bell press
- `/dashboard/packages` — "Manage membership" link and "My Credits" action button
- `/dashboard/buy-package/setup` — "Buy Package" action button and "No Active Plan" CTA
- `/dashboard/book-workout/book-workout` — "Book Session" action button and empty UP NEXT CTA
- `/dashboard/calendar` — "Calendar" action button
- `/dashboard/bookings/{id}` — tapping an upcoming appointment card

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `package_instances` (tenant) | READ | `clientId`, `status`, `creditsRemaining`, `creditsTotal`, `expiresAt` |
| `appointments` (tenant) | READ | `userId`, `status`, `startTime`, `duration`, `creditsUsed`, service join |
| `notifications` (tenant) | READ (count) | `userId`, `isRead` |

**Key types:**
- `activePackage` — package instance record with `creditsRemaining`, `creditsTotal`, `expiresAt`
- `planStats` — derived: `{ creditsRemaining, creditsTotal, progress, weeksToFinish, renewalDate }`
- `upcomingActivity` — derived: `{ id, title, time, duration, date, image }`
- `recentActivities` — derived array: `{ id, name, date, credits, icon }`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
- No-package empty state vs. API error differentiation
- Pull-to-refresh invalidation breadth (all three query keys)
- Notification badge overflow display (shows "9+" for >9 unread)

---

## 6. Notes

- `getGreeting()` returns time-of-day greeting ("Good Morning" / "Good Afternoon" / "Good Evening") based on local device time, not server time.
- Profile image in greeting card is hardcoded to `https://via.placeholder.com/48` — customer profile images are not yet surfaced here.
- The "Quick insight" card text ("Most members book 2 workouts per week...") is hardcoded static text, not personalized data.
- `upcomingAppointments` uses `orpc` query options pattern (`orpc.router.proc.queryOptions({ input })`); the `organizationId` is required in the input even though the backend uses `session.user.id` as the client filter.
- Recent activity items are not tappable (no `onPress` handler despite wrapping in `TouchableOpacity`) — a known gap.
- `service?.imageUrl` falls back to `DEFAULT_IMAGE` (an Unsplash gym photo URL) when no service image is set.
