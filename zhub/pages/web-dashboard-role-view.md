# User Roles View

**Route:** `/_authenticated/dashboard/_layout/role/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/role/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (no explicit `beforeLoad` guard; server requires `user_management:read`)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Read-only list of all roles defined in the organization, ordered by priority.
**Produces:** A data table of roles with columns for name, description, priority, and system/custom flag.
**On success:** Table renders with all tenant roles.
**On failure / error states:** Spinner while loading. TanStack Query default error handling (no explicit error UI in this route).

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → currentOrganizationId
  → useQuery(orpc.roles.list.queryOptions({ input: { organizationId } }))
      → rolesRouter.list
          → requirePermission(tenantDb, member, "user_management", "read")
          → tenantDb.SELECT FROM roles ORDER BY priority DESC
  → DataTable (columns, data)
```

**Inputs:** No URL/query params.
**State management:** Only TanStack Query state (no local state).
**Outputs:** `DataTable` from `apps/web/src/components/tables/role/view/data-table.tsx` with `columns` from `apps/web/src/components/tables/role/view/columns.tsx`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `roles.list` — fetch all tenant roles ordered by priority descending

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/role/view/data-table.tsx`
- `columns` — `apps/web/src/components/tables/role/view/columns.tsx`

**Uses these hooks:**
- `useUserContext` — supplies `currentOrganizationId`

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — People → User → "User Roles"

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `roles` (tenant) | SELECT | `id`, `name`, `description`, `priority`, `isSystem`, `createdAt`, `updatedAt` |

**Key constraints:**
- System roles (`isSystem = true`) have `priority = 100` reserved for admin
- Custom roles must have `priority` 1–99
- Roles ordered by `priority DESC` (highest priority number first)

---

## 5. Tests

**Test files:** None found.
**Scenarios covered:** N/A
**Not tested (risk areas):**
- No guard against unauthenticated / unauthorized access in `beforeLoad`
- Empty roles list render
- System vs custom role distinction in columns

---

## 6. Notes

- This page uses the `orpc` client's `queryOptions` helper (oRPC-native pattern) rather than the plain `client` import used by most other pages. Both point to the same underlying transport.
- This page is read-only — create/update/delete of roles is handled in the Access Control → Role Management page (`/dashboard/access-control/roles`).
- The sidebar links both "User Roles" (this page, `/dashboard/role/view`) and "Role Management" (`/dashboard/access-control/roles`) — these appear to be separate pages with overlapping purpose.
