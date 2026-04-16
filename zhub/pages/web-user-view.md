# User View

**Route:** `/user/view`
**File:** `apps/web/src/routes/_authenticated/user/view.tsx:1`
**Platform:** web
**Auth required:** rbac(user_management:read)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Display a read-only listing of all organization members (users/employees) with their role and status information.

**Produces:** A data table of members sourced from the tenant database joined with user details from the control panel.

**On success:** Member rows load; table renders with columns defined in `columns.tsx`.

**On failure / error states:**
- Loading → inline "Loading members..." text (no skeleton).
- No `organizationId` → query is disabled; empty table.

---

## 2. How It Works

**Execution flow:**
```
UserViewComponent
  → useUserContext() → organizationId
  → orpc.members.list.queryOptions({ organizationId })
  → DataTable (user/view/data-table) + columns (user/view/columns)
```

**Inputs:** No URL params; `organizationId` from user context.

**State management:** TanStack Query with `orpc.members.list` query options (default staleTime). Query is disabled until `organizationId` is available.

**Outputs:** Read-only table — no create/edit/delete actions on this page.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `members.list` — list members with user details (name, email, role, status)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/user/view/data-table.tsx` — table wrapper
- `columns` — `apps/web/src/components/tables/user/view/columns.tsx` — column definitions

**Uses these hooks:**
- `useUserContext` — resolves current `organizationId`
- `useQuery` via `orpc.members.list.queryOptions` — data fetching

**Navigation: who navigates here:**
- App sidebar: "Employees Listing" under the Users section → `/dashboard/user/view`
- Note: sidebar links to `/dashboard/user/view` but the actual route file is at `/_authenticated/user/view` — there is also a duplicate at `/_authenticated/dashboard/_layout/user/view.tsx`

**Navigation: where it goes:** Stays on page; no outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `members` (tenant) | SELECT | `id`, `userId`, `status`, `role`, `hierarchyScopeId` |
| `user` (control panel auth) | JOIN/SELECT | `name`, `email` |

**Key types / Zod schemas:**
- `members.list` input: `{ organizationId: uuid, role?: enum, status?: enum, hierarchyScopeId?: uuid }`
- RBAC: admins see all members; non-admins see only members within their hierarchy scope.

---

## 5. Tests

**Test files:** None found for this route.

**Not tested (risk areas):**
- RBAC filtering (admin vs staff hierarchy scope)
- Empty state rendering
- Error propagation from API

---

## 6. Notes

- This page is read-only — no mutations are made here. For role assignment and deactivation, users are directed to `/dashboard/access-control/user-assignment`.
- Uses `orpc` client (typed query options) rather than the plain `client` object — both come from `@/utils/orpc`.
- `requirePermission` in `beforeLoad` is a stub and currently does not enforce access.
