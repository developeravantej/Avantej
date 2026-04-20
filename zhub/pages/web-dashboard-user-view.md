# Members (User View)

**Route:** `/_authenticated/dashboard/_layout/user/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/user/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (no `beforeLoad` guard; server requires `user_management:read`; admin callers get extra actions column)
**Last updated:** 2026-04-20

---

## 1. What It Does

**Purpose (user perspective):** Read-only listing of all organization members (employees), showing name, email, role, status, and join date.
**Produces:** A data table of members enriched with user details from the control panel.
**On success:** Table renders with all visible members (RBAC-scoped: admins see all, staff see only their hierarchy).
**On failure / error states:** "Select an organization" message if no org is selected. Spinner while loading. TanStack Query error state (no explicit error UI).

---

## 2. How It Works

**Execution flow:**
```
UserViewPage
  → useUserContext() → currentOrganizationId, hasRole
  → callerIsAdmin = hasRole(["admin"])
  → columns = createColumns({ callerIsAdmin, organizationId })
      → baseColumns always present
      → if callerIsAdmin: append actions column with <MemberActionsCell>
  → useQuery(["members", organizationId])
      → client.members.list({ organizationId })
          → memberRouter.list
              → requirePermission(tenantDb, member, "user_management", "read")
              → [RBAC] admins: all members; staff: members in accessibleNodeIds
              → tenantDb.SELECT FROM members
              → controlPanel.SELECT FROM user WHERE id IN (memberUserIds)
              → returns enriched list with name + email from control panel
  → DataTable (columns, data)
```

**Inputs:** No URL/query params.
**State management:** Only TanStack Query state; `enabled: !!organizationId`.
**Outputs:** `DataTable` from `apps/web/src/components/tables/user/view/data-table.tsx`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `members.list` — fetch members with cross-DB user enrichment (name, email from control panel)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/user/view/data-table.tsx`
- `createColumns` factory — `apps/web/src/components/tables/user/view/columns.tsx` — produces column defs; appends `MemberActionsCell` actions column when `callerIsAdmin=true`
- `MemberActionsCell` — `apps/web/src/components/tables/user/view/actions-cell.tsx` — "Login as" (impersonation) action; only renders for admin callers targeting staff-role rows

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — People → User → "Employees Listing"

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `members` (tenant) | SELECT | `id`, `userId`, `role`, `status`, `hierarchyScopeId`, `joinedAt` |
| `user` (control panel) | SELECT | `id`, `name`, `email` |

**Returned shape per member:**
```typescript
{
  id: string;
  userId: string;
  role: "admin" | "trainer" | "staff" | "client";
  hierarchyScopeId: string;
  status: "active" | "suspended";
  joinedAt: Date | null;
  name: string;   // from control panel user, "Unknown" if not found
  email: string;  // from control panel user, "Unknown" if not found
}
```

---

## 5. Tests

**Test files:** None found.
**Scenarios covered:** N/A
**Not tested (risk areas):**
- RBAC scope filtering for non-admin members
- No organization selected state

---

## 6. Notes

- This page and `access-control/user-assignment` both call `members.list` with the same query key `["members", organizationId]`. They share the TanStack Query cache, so mutations from the user-assignment page will also refresh this page.
- The page title says "Members" but the sidebar link says "Employees Listing" — label inconsistency.
- This is a read-only page; member management (role updates, deactivation, invitations) is done from `access-control/user-assignment`.
- **Name fallback behavior:** When a member's `name` is "Unknown" but their `email` is valid (not "No email"), the Name column displays the email address instead in `text-muted-foreground text-sm` style. Avatar initials are computed from whichever value is actually displayed (name or email fallback).
