# Dashboard Home

**Route:** `(app)/dashboard/home`
**File:** `apps/native/app/(app)/dashboard/index.tsx`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Show user greeting, active fitness plan progress, upcoming session, and recent activity in one dashboard view.
**Produces:** Scrollable home screen with header (greeting, notifications badge), plan card (credits remaining, progress bar), quick insight, action buttons (book, calendar, buy package, my credits), upcoming session card, recent activity list.
**On success:** All data loads and displays; pull-to-refresh updates all queries.
**On failure / error states:** Skeleton loaders while fetching; error messages if API calls fail; "No Active Plan" card if no package; "No upcoming sessions" empty state.

---

## 2. How It Works

**Execution flow:**
1. Fetches organization context via `useOrganization()` hook
2. Queries 4 oRPC endpoints in parallel:
   - `orpc.packageInstances.getActiveForClient` (plan details, credits, expiry)
   - `orpc.notifications.getUnreadCount` (unread badge, refetch every 30s)
   - `orpc.appointments.listForUser` (upcoming confirmed session, limit 1, from today forward)
   - `orpc.appointments.listForUser` (recent appointments, limit 5, all statuses)
3. Derives computed state: planStats (progress %), upcomingActivity, recentActivities
4. Renders conditional UI based on loading/error/data states
5. Pull-to-refresh invalidates packageInstances, appointments, notifications queries

**Inputs:** organizationId (from context)
**State management:** TanStack Query with oRPC queryOptions; derived state via useMemo for planStats, recentActivities
**Outputs:** Renders header, plan card, action buttons, upcoming session, recent activity; navigates on button presses
**Side effects:** onRefresh invalidates 3 query families; notification bell navigates to notifications screen

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.packageInstances.getActiveForClient` — fetch active subscription
- `orpc.notifications.getUnreadCount` — fetch unread notification count
- `orpc.appointments.listForUser` (2x) — fetch upcoming and recent appointments

**Uses these components:** TabContainer, Image, ScrollView, TouchableOpacity, ActivityIndicator, View, Text, Ionicons
**Uses these hooks:** `useAuth()` (user name), `useOrganization()` (orgId), `useQuery()` (TanStack Query), `useTabBarHeight()` (padding), `useMemo()`, `useCallback()`
**Navigation: who navigates here:** Root of (app) routes after auth check
**Navigation: where it goes:**
- `/dashboard/notifications/` — notification bell
- `/dashboard/book-workout/book-workout` — book session button
- `/dashboard/calendar` — calendar button
- `/dashboard/buy-package/setup` — buy package buttons
- `/dashboard/packages` — manage membership
- `/dashboard/bookings/{id}` — upcoming session card tap

---

## 4. Data Shapes

**DB tables touched:** 
- packageInstances (select creditsRemaining, creditsTotal, expiresAt)
- appointments (select id, startTime, duration, status, creditsUsed; join services for name/imageUrl)
- notifications (count unread)

**Key types / Zod schemas:**
- activePackage: { creditsRemaining, creditsTotal, expiresAt }
- appointment: { id, startTime, duration, status, creditsUsed, service?: { name, imageUrl } }
- planStats derived: { creditsRemaining, creditsTotal, progress, weeksToFinish, renewalDate }
- recentActivities: { id, name, date, credits, icon, status }

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):** 
- Error state display (package error, upcoming error, recent error branches)
- Pull-to-refresh invalidation logic
- 30s refetch interval for notifications
- Accessibility of notification badge number formatting (9+)
- Time/date formatting edge cases (week calculation, relative past)

---

## 6. Notes

- activePackage data typing is loose (uses `as any` for service fields); suggests union type or discriminator needed
- Skeleton components animate with Tailwind's animate-pulse class
- Plan stats derived state uses useMemo with activePackage dependency but derives from optional fields
- Notification refetch interval: 30s (hardcoded, not configurable)
- "At this pace" calculation uses creditsTotal and creditsRemaining to project weeks remaining
- Default service image used: `https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=400`
- Pull-to-refresh uses predicate to target only relevant query families
