# Role Management

**Route:** `/dashboard/role/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/role/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** (Stub page — redirects to access control roles)

**Produces:** None (redirects before render)

**On success:** User navigated to `/dashboard/access-control/roles` (the new roles management UI)

**On failure / error states:** None (redirect happens before component mount)

---

## 2. How It Works

**Execution flow:**
1. Route is defined but does not render a component
2. Instead, it uses a `beforeLoad` hook that calls `makeTabRedirect("/dashboard/access-control/roles", "roles")`
3. Router performs a redirect before the page loads
4. User is sent to the new access control interface

**Inputs:** None

**State management:** None (redirect happens in route setup)

**Outputs:** Redirect to new route

**Side effects:** Navigation to `/dashboard/access-control/roles`

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:** None

**Uses these hooks:** None

**Navigation: who navigates here:**
- Old direct URLs or sidebar links pointing to `/dashboard/role/view`

**Navigation: where it goes:**
- `/dashboard/access-control/roles` (new roles management page)

---

## 4. Data Shapes

**DB tables touched:** None

**Key types / Zod schemas:** None

---

## 5. Tests

**Test files:** None

**Scenarios covered:** None

**Not tested (risk areas):** None (stub page)

---

## 6. Notes

- **Legacy notice:** File header comments "LEGACY — slated for rewrite; do not extend"
- **Redirect hook:** Uses `makeTabRedirect()` utility (likely adds tab context, e.g., preselect "roles" tab in access control)
- **No rendering:** This is a redirect stub; the actual roles UI lives in `/dashboard/access-control/roles`
- **Purpose:** Backward compatibility — old bookmarks/links to `/dashboard/role/view` are transparently redirected to the new location
