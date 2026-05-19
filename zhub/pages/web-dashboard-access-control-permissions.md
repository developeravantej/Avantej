# Access Control - Permissions (Legacy Redirect)

**Route:** `/dashboard/access-control/permissions`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/permissions.tsx`
**Platform:** web
**Auth required:** authenticated (inherited from `_authenticated` layout)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Legacy redirect stub. Forwards bookmarks to the Roles page's Permissions tab.

**Produces:** No UI — redirects in `beforeLoad`.

**On success:** Redirects to `/dashboard/access-control/roles?tab=permissions`.

**On failure / error states:** None (no user-facing logic).

---

## 2. How It Works

**Execution flow:** Route loaded → `beforeLoad: makeTabRedirect("/dashboard/access-control/roles", "permissions")` → router replaces history before render.

**Inputs:** None.
**State management:** None.
**Outputs:** Single navigation redirect.
**Side effects:** Router history entry updated.

---

## 3. What Depends On It

**Calls these API endpoints:** None.
**Uses these components:** None.
**Uses these hooks:** None.

**Navigation in:** Old bookmarks, legacy in-app links.
**Navigation out:** `/dashboard/access-control/roles?tab=permissions` (which renders `PermissionsTabPage` inside the Roles shell).

---

## 4. Data Shapes

None.

---

## 5. Tests

**Test files:** None found.

**Not tested:** Redirect target's `requirePermission` guard rejecting users — they'd be sent to `/dashboard` after a double redirect.

---

## 6. Notes

- `makeTabRedirect` lives at `@/lib/tab-redirect`; shared with the `/access-control/invitations` redirect stub.
- Actual permission browsing UI is `PermissionsTabPage` @ `apps/web/src/components/pages/access-control/permissions-tab.tsx`, mounted by the Roles route when `?tab=permissions`.
- The Roles route requires `role_management:read` via `requirePermission`; users without it will bounce again to `/dashboard` after this redirect.
- Phase 1 web-debt-cleanup did not touch this stub.
