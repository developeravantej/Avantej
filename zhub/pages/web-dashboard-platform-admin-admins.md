# Platform Admin — Admins

**Route:** `/dashboard/platform-admin/admins`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/admins.tsx`
**Platform:** web
**Auth required:** platform-admin (super_admin role only)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage platform admin accounts (only super admins can view/edit).
**Produces:** Table of platform admins with role, grant date, granted-by info + Add/Revoke dialogs.
**On success:** Admin list rendered; grant/revoke mutations succeed with toast + query refresh.
**On failure / error states:** Redirect to /dashboard if not super admin; error toast on mutation fail; loading state in table.

---

## 2. How It Works

**Execution flow:** Route load → `beforeLoad` checks `client.admin.me()` → if not super_admin, redirect → render page → query admins via TanStack Query → render table + dialogs
**Inputs:** None (page-level)
**State management:** TanStack Query `["admin", "listAdmins"]`; local state for dialogs (revokeTarget, addDialogOpen); mutations for grant/revoke
**Outputs:** Admin table; AddAdminDialog; RevokeDialog
**Side effects:** Queries invalidated after grant/revoke; toasts on success/error; session used to hide self-revoke button

---

## 3. What Depends On It

**Calls these API endpoints:**
  - `client.admin.me({})` — gets current user role (beforeLoad)
  - `client.admin.listAdmins({})` — fetches all platform admins
  - `client.admin.listUsers({ search, page, limit })` — search users for grant dialog
  - `client.admin.grantPlatformAdmin({ userId, role })` — grants admin access
  - `client.admin.revokePlatformAdmin({ userId })` — revokes admin access
**Uses these components:** UI primitives (Button, Dialog, Input, Select, Table, Badge, etc.) from shadcn/ui
**Uses these hooks:** useQuery, useMutation, useDebounce, useSession (authClient)
**Navigation: who navigates here:** Platform admin sidebar
**Navigation: where it goes:** /dashboard (on unauthorized access)

---

## 4. Data Shapes

**DB tables touched:** controlPanelDb: platform_admins (R/W)
**Key types / Zod schemas:**
  - AdminRole: "super_admin" | "support" | "billing"
  - AdminRow: `{ userId, email, name, role, grantedAt, grantedByEmail }`
  - UserRow: `{ id, email, firstName, lastName, name, isPlatformAdmin, platformAdminRole }`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):**
  - Role-based access (beforeLoad guard, but no test coverage)
  - Search debounce edge cases
  - Self-revoke prevention (UI-only; no server-side check)
  - Concurrent grant/revoke operations
  - Session stale after grant/revoke

---

## 6. Notes

- Only super admins can view this page; support/billing roles redirect to dashboard
- Self-revoke button is hidden to prevent lockout (UI-level safety)
- "Only users without existing admin access are shown" in grant dialog (filtered client-side)
- AddAdminDialog resets state on close
- Task 5.3 runbook note: nightly cleanup of orphaned admin_sessions rows (deferred to production runbook)
