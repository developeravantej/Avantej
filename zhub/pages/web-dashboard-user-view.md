# Members (User View)

**Route:** `/dashboard/user/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/user/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** View a list of all members in the current organization, with their role, status, email, join date, and member ID.

**Produces:** A read-only table of organization members with columns: Name (avatar + display name), Email (copyable), Role (badge), Status (active/suspended badge), Joined date, Member ID (copyable, truncated).

**On success:** Table renders with fetched member data.

**On failure / error states:**
- No `organizationId`: centered placeholder "Select an organization to view members."
- Loading: centered spinner.
- No empty-state UI for zero results beyond the table's default "No results." row.

---

## 2. How It Works

**Execution flow:**
```
UserViewPage
  → useQuery(["members", orgId])
      → client.members.list({ organizationId })
          → memberRouter.list (packages/api/src/routers/members.ts)
              → requirePermission(tenantDb, member, "user_management", "read")
              → SELECT FROM members WHERE [role/status/scope filters]
              → cross-DB enrichment: SELECT id, name, email FROM user (control panel)
              → returns merged array with name + email from control panel
  → DataTable renders enriched member rows
```

**Inputs:** `organizationId` from `useUserContext()` (not a URL param). No filter controls on this page — no search, role filter, or status filter are exposed in the UI.

**State management:** `useQuery` via TanStack Query; cache key `["members", organizationId]`. No local state beyond what TanStack Query manages.

**Outputs:** Read-only table render. No mutations are triggered from this page.

**Side effects:** None.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `members.list` — fetches all members visible to the calling member (RBAC-scoped)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/user/view/data-table.tsx` — basic table without sorting, pagination, or filtering controls
- `columns` — `apps/web/src/components/tables/user/view/columns.tsx` — Name, Email (copyable), Role badge, Status badge, Joined date, Member ID (copyable)
- `DataTableColumnHeader` — `apps/web/src/components/tables/data-column-header.tsx` — sortable column header (sorting wired in columns but not in DataTable's `useReactTable` config — no sort state)

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`
- `useQuery` — fetches member list

**Navigation: who navigates here:**
- App sidebar (`apps/web/src/components/app-sidebar.tsx:211,215`) under the Users/Employees section — link titled "Employees Listing"

**Navigation: where it goes:** No outbound navigation from this page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `members` (tenant DB) | SELECT | `id`, `userId`, `role`, `hierarchyScopeId`, `status`, `joinedAt` |
| `user` (control panel DB) | SELECT | `id`, `name`, `email` |

**Key types:**

`MemberRow` (from `columns.tsx`):
```ts
{
  id: string;
  userId: string;
  role: "admin" | "trainer" | "staff" | "client";
  hierarchyScopeId: string;
  status: "active" | "suspended";
  joinedAt: Date | null;
  name: string | null;
  email: string | null;
}
```

The API merges `members` (tenant DB) with `user` (control panel DB) via a batch in-memory join on `userId`. Members with no matching control panel user record fall back to `name: "Unknown"` / `email: "Unknown"`.

---

## 5. Tests

**Test files:** None found.

**Not tested:** Member list rendering, RBAC scoping (admin vs non-admin visibility), cross-DB enrichment, loading/no-org states.

---

## 6. Notes

- **RBAC scoping at API layer:** `admin` members see all members in the org. Non-admins see only members whose `hierarchyScopeId` falls within their accessible descendant nodes (`getDescendantNodeIds`). This is invisible to the UI — the page passes no filters.
- **DataTable is minimal:** The user/view `DataTable` uses only `getCoreRowModel` — no pagination, sorting, or filtering. The `enableSorting: true` flags in `columns.tsx` have no effect because no `getSortedRowModel` is registered in the table config.
- **Cross-DB join:** The `members.list` handler fetches `name`/`email` from the control panel `user` table. If `controlPanelDb` is unavailable in context, `userMap` remains empty and all rows show `"Unknown"` for name and email.
- **Route permission config:** `apps/web/src/lib/route-config.ts` declares `user_management.read` as required for `/dashboard/user/view`. The same permission is enforced server-side in `memberRouter.list`.
- There are no actions (edit, delete, invite) wired on this page — it is purely a read view. Management actions exist in other routes (e.g., `access-control/user-assignment`).
