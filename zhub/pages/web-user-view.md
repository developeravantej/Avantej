# User View

**Route:** `/_authenticated/user/view`
**File:** `apps/web/src/routes/_authenticated/user/view.tsx:1`
**Platform:** web
**Auth required:** rbac(user_management:read)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Displays a read-only table of all members (employees/users) in the current organization with their role and status.
**Produces:** A basic TanStack Table with member name, email, role, status, and hierarchy scope columns.
**On success:** Member list loads and renders in a striped table.
**On failure / error states:** "Loading members..." text while query is pending. Empty state "No results." when list is empty. No explicit error state displayed.

---

## 2. How It Works

**Execution flow:**
```
UserViewComponent
  → useUserContext() → currentOrganizationId
  → useQuery via orpc.members.list.queryOptions({ input: { organizationId } })
    → memberRouter.list
      → requirePermission(tenantDb, member, "user_management", "read")
      → JOIN members + user (auth schema) for name/email
      → RBAC: admins see all; non-admins see only accessible hierarchy
        → tenant DB: members table + auth.user table
  → <DataTable columns={columns} data={membersData} />
    (apps/web/src/components/tables/user/view/data-table.tsx)
```

**Inputs:** None (no URL params or query params)
**State management:**
- TanStack Query: auto-keyed via `orpc.members.list.queryOptions` (default stale time)
- `isLoading` drives loading text display

**Outputs:** Read-only member table render
**Side effects:** None — display only

---

## 3. What Depends On It

**Calls these API endpoints:**
- `members.list` — fetch all organization members (no role filter, returns all roles)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/user/view/data-table.tsx` — minimal table, no filtering or actions
- `columns` — `apps/web/src/components/tables/user/view/columns.tsx` — column definitions

**Uses these hooks:**
- `useUserContext` — retrieves `currentOrganizationId`
- `useQuery` (via `orpc.members.list.queryOptions`) — data fetching

**Navigation: who navigates here:**
- App sidebar: "Employees Listing" under Users/HR group → `/dashboard/user/view` (sidebar points to dashboard twin)
- `requirePermission` guard in `beforeLoad` redirects to `/dashboard` if absent

**Navigation: where it goes:** No outbound navigation; display-only page

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `members` (tenant) | SELECT | `id`, `userId`, `role`, `status`, `hierarchyScopeId` |
| `user` (auth schema) | JOIN | `id`, `name`, `email` |

**Key types / Zod schemas:**
- `members.list` input: `{ organizationId: uuid, role?: "admin"|"trainer"|"staff"|"client", status?: "active"|"suspended", hierarchyScopeId?: uuid }`
- Returns joined member + user: `{ id, userId, name, email, role, status, hierarchyScopeId, ... }`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** RBAC filtering (non-admin only sees subset); missing error state when query fails

---

## 6. Notes

- This page is purely read-only — no create, edit, or delete actions. Full member management lives in `_authenticated/dashboard/_layout/access-control/`.
- There is a duplicate dashboard route at `/_authenticated/dashboard/_layout/user/view` — sidebar links there; this standalone version is an alternate entry point.
- Uses `orpc.members.list.queryOptions` (oRPC-typed helper) rather than the raw `client` object, unlike most other pages which use `client.*` directly.
- No organization-not-selected guard — `organizationId` defaults to `""` which will likely return an error or empty list from the API.
