# Notifications

**Route:** `/dashboard/notifications/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/notifications/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View notification history filtered by read status (All / Unread / Read); mark notifications as read individually or in bulk.

**Produces:** Filterable table of notifications with read/unread status; actions to mark individual as read; bulk mark-all-as-read button.

**On success:**  
- List: notifications populate table with filter applied
- Mark one: notification marked read; query invalidated; table refreshes
- Mark all: all notifications marked read; toast confirms; table refreshes

**On failure / error states:**  
- No org: guard message "Select an organization..."
- Loading: spinner
- Empty: contextual message ("You're all caught up!" if unread filter, "No notifications" otherwise)

---

## 2. How It Works

**Execution flow:**  
1. Page guards: checks org
2. Query `client.notifications.list({ organizationId, isRead: readFilter })`
3. Renders read/unread filter tabs (All / Unread / Read)
4. Maps API data → NotificationRow[] (id, title, message, type, isRead, createdAt)
5. Table shows: title, message (truncated @ 80 chars), type badge, date (relative: "3m ago"), status badge
6. "Mark Read" action button appears only on unread rows
7. "Mark All as Read" button in header (disabled if no data or all read)
8. Click row action → `markReadMutation` for individual notification
9. Click header button → `markAllReadMutation` for bulk operation

**Inputs:**  
- Read filter (local state): undefined (All) | false (Unread) | true (Read)

**State management:**  
- TanStack Query: `["notifications", organizationId, readFilter]`
- Local state: readFilter

**Outputs:**  
- Table with conditional action buttons
- Toast notification

**Side effects:**  
- Query invalidation on mutation success
- Toast shown on bulk mark-all-read

---

## 3. What Depends On It

**Calls these API endpoints:**  
- `client.notifications.list({ organizationId, isRead? })` — fetch notifications
- `client.notifications.markRead({ organizationId, id })` — mark one as read
- `client.notifications.markAllRead({ organizationId })` — mark all as read

**Uses these components:**  
- `DataTable<NotificationRow>` — `src/components/tables/sales/view/data-table` — table rendering
- `EmptyState` — displayed when no notifications
- `Button`, `Badge`, `Separator` (shadcn/ui)
- Notification columns from `@/components/tables/notifications/view/columns`

**Uses these hooks:**  
- `useUserContext()` — org ID
- `useQuery()` — fetch notifications
- `useMutation()` — mark read / mark all read
- `useQueryClient()` — invalidation

**Navigation: who navigates here:**  
- Dashboard sidebar link

**Navigation: where it goes:** None (internal table only)

---

## 4. Data Shapes

**DB tables touched:**  
- `notifications` (read/write) — notification records + read status

**Key types / Zod schemas:**  
```tsx
interface NotificationRow {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**  
- Filter tab switching and query re-fetch
- Mark individual read behavior
- Mark all read behavior
- Relative time formatting ("3m ago", "1h ago", etc.)
- Message truncation at 80 chars
- Empty state logic per filter state
- Unread count badge if shown

---

## 6. Notes

- **Time formatting**: Uses `timeAgo()` helper that computes relative time from createdAt
- **Message truncation**: Truncated to 80 chars in table cell with ellipsis
- **Filter tabs**: Read/Unread filter is set to undefined (All), false (Unread), true (Read) per tab
- **Action button**: "Mark Read" button only renders if `isRead === false`
- **Mark All button**: Disabled if no data or all are read (determined by button disabled state)
- **Status badge**: Shows "Unread" for unread notifications; hidden for read ones
- **Bulk toast**: Shows "All marked as read" on bulk operation success
- **Columns source**: Uses exported `columns` from `@/components/tables/notifications/view/columns` plus custom actions column

