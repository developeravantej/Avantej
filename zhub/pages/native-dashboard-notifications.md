# Notifications List

**Route:** `(app)/dashboard/notifications`
**File:** `apps/native/app/(app)/dashboard/notifications/index.tsx`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View all notifications (bookings, reminders, promotions, system) with pull-to-refresh. Mark individual or all notifications as read. Tap notifications to navigate to relevant screens.
**Produces:** Scrollable list of notification cards with type icon, title, message, timestamp, unread indicator. Header shows unread count and "Mark all read" button. Empty state if no notifications.
**On success:** Notifications load; pull-to-refresh updates; tapping marks as read and navigates appropriately.
**On failure / error states:** Empty state ("No notifications"); load errors handled silently.

---

## 2. How It Works

**Execution flow:**
1. Get `organizationId` from `useOrganization()` hook
2. Query notifications: `orpc.notifications.list({ organizationId, limit: 50 })`
3. Map notifications to display format: extract type, title, message, timestamp (formatted as "X ago"), unread status, icon, color
4. Count unread notifications
5. On notification card tap: call `client.notifications.markRead({ organizationId, id })` + navigate based on type:
   - "booking" type: navigate to `/dashboard/bookings/[id]` (use `referenceId`)
   - "reminder" type: navigate to `/dashboard/bookings`
   - "promotion" type: navigate to `/dashboard/explore`
   - (system type: no navigation)
6. On "Mark all read" button: call `client.notifications.markAllRead({ organizationId })`
7. On pull-to-refresh: call `refetch()`
8. Hide tab bar on focus, show on blur (via navigation recursion)

**Inputs:** None (organization context)
**State management:**
- TanStack Query: `notifications` query
- Local state: `refreshing` for pull-to-refresh UI
- `useRef` for tab bar visibility
- Tab bar managed via parent navigator `setOptions()`
**Outputs:** Scrollable Container with notification list
**Side effects:** Mark read mutations silently fail; navigation on card tap; tab bar hiding

---

## 3. What Depends On It

**Calls these API endpoints:**
- `orpc.notifications.list` — fetches notification records (limit 50)
- `client.notifications.markRead` — marks single notification as read (mutation)
- `client.notifications.markAllRead` — marks all as read (mutation)
**Uses these components:**
- `Container` (path: `@/components/container`) — root layout
**Uses these hooks:**
- `useOrganization()` — provides organizationId
- `useFocusEffect()`, `useNavigation()` — tab bar control
- `useQuery()`, `useQueryClient()` from TanStack Query
- `useCallback()`, `useRef()` from React
**Navigation: who navigates here:** Tab navigator (notifications tab) or direct link
**Navigation: where it goes:**
  - `/dashboard/bookings/[id]` (if booking notification + referenceId)
  - `/dashboard/bookings` (if reminder)
  - `/dashboard/explore` (if promotion)

---

## 4. Data Shapes

**DB tables touched:** `notifications` (tenantDb, read)
**Key types / Zod schemas:**
Input to `list`:
```
{
  organizationId: string
  limit: number (50)
}
```
Notification object (raw):
```
{
  id: string
  type: "booking" | "reminder" | "promotion" | "system"
  title: string
  message?: string
  body?: string (fallback if message missing)
  isRead: boolean
  createdAt: ISO string
  referenceId?: string (for booking notifications)
}
```
Notification object (mapped for display):
```
{
  id: string
  type: string
  title: string
  message: string
  time: string (formatted "X ago")
  read: boolean
  icon: Ionicons name (e.g., "calendar", "time", "gift")
  color: hex color
  referenceId?: string
}
```

---

## 5. Tests

**Test files:** None found
**Not tested (risk areas):**
- Mark read mutations silently fail (error not logged or shown)
- Tab bar recursion (same fragile pattern as detail screens)
- Race condition: user rapidly taps multiple notifications
- Timestamp formatting for edge cases (older than 7 days shows date, not "ago")
- Navigation with missing referenceId for booking type (no fallback)

---

## 6. Notes

- Mark read mutations use `client` (not `useQuery`)—fire-and-forget pattern, errors silent.
- Unread badge only shown if count > 0; "Mark all read" button conditionally rendered.
- Notification time formatted as "X ago" (e.g., "5 min ago", "2 hours ago"), older than 7 days shows date only.
- Icon color matches notification type (blue for booking, orange for reminder, green for promotion, gray for system).
- Unread notifications styled with left border accent + opacity reduced when read.
- Empty state shows icon + message ("No notifications").
- Pull-to-refresh supported via RefreshControl; manual state management (doesn't use React Query's built-in refetch UI).
