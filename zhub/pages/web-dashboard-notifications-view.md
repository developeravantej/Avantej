# Notifications

**Route:** `/dashboard/notifications/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/notifications/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Shows the user's full notification history with the ability to mark individual notifications as read or mark all as read at once.
**Produces:** A filterable table of notifications (All / Unread / Read tabs) with title, message (truncated at 80 chars), type badge, relative timestamp, read/unread status, and a "Mark Read" action per unread row.
**On success:** Notifications update immediately after marking; "All marked as read" toast on bulk action.
**On failure / error states:** Full-page spinner while loading; "Select an organization" guard; empty state with bell icon when no notifications match the current filter.

---

## 2. How It Works

**Execution flow:**
```
NotificationsViewPage
  → useUserContext() → organizationId
  → useState(readFilter: boolean | undefined)   // undefined=All, false=Unread, true=Read
  → useQuery(notifications.list) → client.notifications.list({ organizationId, isRead: readFilter })
  → renders DataTable with staticColumns + dynamic "actions" column
  → "Mark Read" button → useMutation(notifications.markRead({ organizationId, id }))
  → "Mark All as Read" → useMutation(notifications.markAllRead({ organizationId }))
  → onSuccess → invalidateQueries(["notifications", orgId]) + toast
```

**Inputs:** No URL params. Filter tab is local state.
**State management:** `useState<boolean | undefined>` for read filter; TanStack Query for data and two mutations.
**Outputs:** Table render; two mutations (per-row mark-read, bulk mark-all).
**Side effects:** Cache key `["notifications", orgId]` invalidated on both mutation successes.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `notifications.list` — list notifications for org, optionally filtered by `isRead`
- `notifications.markRead` — mark single notification as read by id
- `notifications.markAllRead` — mark all notifications read for the org

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table wrapper
- Static columns from `apps/web/src/components/tables/notifications/view/columns.tsx` — title (bold if unread), message, type badge, relative timestamp, read/unread badge
- `Button`, `Separator` — shadcn/ui
- `Bell` icon (lucide-react)

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useQueryClient` — for invalidation

**Navigation: who navigates here:**
- App sidebar under Notifications section → "Notifications" link
- `GreetingBanner` bell icon on the dashboard home page — `apps/web/src/components/dashboard/greeting-banner.tsx:40`
- App topbar bell button — `apps/web/src/components/app-topbar.tsx:127`

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `notifications` | SELECT / UPDATE | `id`, `title`, `message`, `type`, `isRead`, `createdAt`, `organizationId` |

**Key type:**
```typescript
interface NotificationRow {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string; // ISO string
}
```

---

## 5. Tests

**Test files:** None found.
**Not tested:** Filtering tabs, mark-read interaction, bulk mark-all, empty state variants.

---

## 6. Notes

- The "Mark All as Read" button is disabled when `data.length === 0` (regardless of the active filter tab).
- Message text is truncated to 80 characters in the column cell renderer.
- Relative timestamps use a local `timeAgo` helper in the columns file (minutes / hours / days ago).
- The `isRead` badge shows only for unread rows; read rows show nothing in that column.
