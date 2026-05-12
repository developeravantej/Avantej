# Access Control - Permissions (Legacy Redirect)

**Route:** `/dashboard/access-control/permissions`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/permissions.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Legacy redirect stub. This page is slated for rewrite and does not render UI.

**Produces:** No user-visible output (immediate redirect).

**On success:** Redirects to `/dashboard/access-control/roles` with tab param `permissions`.

**On failure / error states:** N/A (stub route)

---

## 2. How It Works

**Execution flow:** Route loads → beforeLoad hook calls `makeTabRedirect("/dashboard/access-control/roles", "permissions")` → user redirected before component renders

**Inputs:** None (redirect is automatic)

**State management:** None

**Outputs:** Navigation redirect only

**Side effects:** Router history updated

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:** None

**Uses these hooks:** None

**Navigation: who navigates here:** Old bookmarks, legacy links (deprecated)

**Navigation: where it goes:** `/dashboard/access-control/roles?tab=permissions`

---

## 4. Data Shapes

**DB tables touched:** None

**Key types / Zod schemas:** None

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** None

**Not tested (risk areas):** Redirect loop if roles page doesn't exist

---

## 6. Notes

- Marked as LEGACY in code (though comment is in invitations.tsx file).
- Component file exists but is a stub that never renders.
- Actual permissions/roles functionality moved to `/dashboard/access-control/roles` route.
- `makeTabRedirect` helper handles the redirect logic in beforeLoad guard.
