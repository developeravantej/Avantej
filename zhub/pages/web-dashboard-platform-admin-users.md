# Platform Admin — Users

**Route:** `/dashboard/platform-admin/users`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/users.tsx`
**Platform:** web
**Auth required:** platform-admin (any admin role)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Search, view, and impersonate platform users (any platform admin role has access; all actions audited).
**Produces:** Searchable user table with pagination + impersonation & audit log actions.
**On success:** User list rendered with search/pagination controls; impersonate/audit actions available.
**On failure / error states:** Redirect to /dashboard if not platform admin; loading state in table.

---

## 2. How It Works

**Execution flow:** Route load → `beforeLoad` checks `client.admin.me()` → if not platform admin, redirect → render page → query users via TanStack Query with search+page → delegate to UsersTable component
**Inputs:** search (local state); page (local state); callerRole (from usePlatformAdminRole hook)
**State management:** TanStack Query `["admin", "listUsers", { search, page }]`; local state for search/page; pagination info from API response
**Outputs:** UsersTable component + pagination/search controls
**Side effects:** Query refetch on search/page change; reset to page 1 on search change

---

## 3. What Depends On It

**Calls these API endpoints:**
  - `client.admin.me({})` — gets current user role (beforeLoad)
  - `client.admin.listUsers({ search?, page, limit })` — fetches paginated user list
**Uses these components:** `UsersTable` — `@/components/platform-admin/users-table` — table with impersonation/audit actions
**Uses these hooks:** useQuery, useDebounce, usePlatformAdminRole
**Navigation: who navigates here:** Platform admin sidebar
**Navigation: where it goes:** /dashboard (on unauthorized access)

---

## 4. Data Shapes

**DB tables touched:** controlPanelDb: users (READ); actions table for audit trail (implicit via API)
**Key types / Zod schemas:**
  - UserRow: `{ id, email, firstName, lastName, name, lastLoginAt?, isPlatformAdmin, platformAdminRole }`
  - Pagination: `{ currentPage, totalPages, pageSize }`
  - API input: `{ search?: string, page: number, limit: number }`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
  - Role-based access (beforeLoad guard only)
  - Search debounce timing
  - Pagination boundary conditions
  - Impersonation audit trail (delegated to UsersTable, not tested here)

---

## 6. Notes

- Access gated to any platform-admin role (super_admin, support, billing)
- Search is debounced 300ms (in UsersTable)
- Page resets to 1 when search changes
- All actions logged/audited (enforcement delegated to backend + UsersTable component)
- UsersTable component handles: impersonation dialog, audit log display, role-based action visibility
