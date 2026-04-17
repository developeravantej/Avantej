# Notifications

**Route:** `/dashboard/notifications`
**File:** `apps/native/app/(app)/dashboard/notifications/index.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** View, read, and act on all personal notifications (booking confirmations, reminders, promotions, system alerts).

**Produces:** A scrollable list of notification cards with type icon, title, message, timestamp, and unread indicator. A header shows an unread count badge and a "Mark all read" button.

**On success:** Notifications load and display. Tapping a notification marks it as read and (for certain types) deep-links to the relevant screen.

**On failure / error states:**
- Loading: 3 skeleton notification cards animate in.
- Empty state: "No notifications" with a bell-off icon.
- `markRead` / `markAllRead` errors are silently swallowed.

---

## 2. How It Works

**Execution flow:**
```
NotificationsScreen
  → useOrganization() → organizationId
  → useQuery(orpc.notifications.list, { organizationId, limit: 50 }) → notifications
  → Map to local shape: id, type, title, message, time (formatTimeAgo), read, icon, color, referenceId
  → Pull-to-refresh: calls refetch()
  → handleNotificationPress(notification):
    → if !read: client.notifications.markRead({ organizationId, id })
    → queryClient.invalidateQueries(["notifications"])
    → Deep-link by type:
        "booking"   → /dashboard/bookings/[referenceId]
        "reminder"  → /dashboard/bookings
        "promotion" → /dashboard/explore
  → handleMarkAllRead: client.notifications.markAllRead({ organizationId })
  → Tab bar hidden/shown via useFocusEffect + useEffect
```

**Inputs:** None (reads from session user via API).

**State management:**
- `refreshing: boolean` — pull-to-refresh indicator
- `hideTabBarRef: MutableRefObject<boolean>` — tracks whether tab bar was hidden (used to guard restore)

**Outputs:**
- List of notification cards; unread cards have a left accent border and a blue dot
- Read cards rendered at 0.7 opacity

**Side effects:**
- `client.notifications.markRead` mutation on tap (fire-and-forget, silently fails)
- `client.notifications.markAllRead` mutation on "Mark all read" tap
- Hides/restores tab bar on focus/blur

---

## 3. What Depends On It

**Calls these API endpoints:**
- `notifications.list` — `{ organizationId, limit: 50 }` — list all notifications for session user
- `notifications.markRead` — `{ organizationId, id }` — mark single notification read
- `notifications.markAllRead` — `{ organizationId }` — mark all notifications read

**Uses these components:**
- `Container` — `apps/native/components/container.tsx`
- `useOrganization` — `apps/native/hooks/useOrganization.ts`
- `SkeletonNotification` — local inline component

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/index.tsx` — notification bell icon in the dashboard header (`router.push("/dashboard/notifications/")`)

**Navigation: where it goes:**
- `/dashboard/bookings/[id]` — tap booking notification with `referenceId`
- `/dashboard/bookings` — tap reminder notification
- `/dashboard/explore` — tap promotion notification
- `router.back()` — back arrow in header

---

## 4. Data Shapes

**DB tables touched (via API):**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `notifications` | SELECT | `id`, `type`, `title`, `message`/`body`, `isRead`, `createdAt`, `referenceId`, `userId` |
| `notifications` | UPDATE | `isRead` (via markRead/markAllRead) |

**Notification types (determines icon + color + deep-link):**
```typescript
type: "booking" | "reminder" | "promotion" | "system" | string
```

**Local notification shape:**
```typescript
{
  id: string
  type: string
  title: string
  message: string
  time: string         // formatTimeAgo output
  read: boolean
  icon: string         // Ionicons name
  color: string        // hex
  referenceId: string | null
}
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- `queryClient.invalidateQueries({ queryKey: ["notifications"] })` uses a string array key that may not match the actual oRPC query key (which is structured by oRPC internally) — invalidation may silently not work.
- Silent failure on `markRead`/`markAllRead` means the UI optimistically shows read state only after refetch, not immediately.
- Deep-link for `"booking"` type requires `referenceId` to be a valid booking ID; no validation.

---

## 6. Notes

- `formatTimeAgo` is a local utility (not from a shared lib) — duplicated from other screens if any.
- The tab bar hide/show logic is duplicated: both `useFocusEffect` and `useEffect` are used with slightly different timeouts (50ms vs 100ms). This pattern is repeated across several detail screens.
- The screen uses `Container` (not `TabContainer`) — it does not have tab-bar-aware bottom padding since it hides the tab bar entirely.
- Unread count badge in the header is purely derived from local `notificationList` state; it updates on query refetch only.
