# Access Control - Invitations (Legacy Redirect)

**Route:** `/dashboard/access-control/invitations`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/invitations.tsx`
**Platform:** web
**Auth required:** authenticated (inherited from `_authenticated` layout)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Legacy redirect stub. Old bookmarks land here and are forwarded into the Staff Access page's Invitations tab.

**Produces:** No UI — redirects in `beforeLoad`.

**On success:** Redirects to `/dashboard/access-control/user-assignment?tab=invitations`.

**On failure / error states:** None (no user-facing logic).

---

## 2. How It Works

**Execution flow:** Route loaded → `beforeLoad: makeTabRedirect("/dashboard/access-control/user-assignment", "invitations")` → router replaces history before render.

**Inputs:** None.
**State management:** None.
**Outputs:** Single navigation redirect.
**Side effects:** Router history entry updated.

---

## 3. What Depends On It

**Calls these API endpoints:** None.
**Uses these components:** None.
**Uses these hooks:** None (router-level `beforeLoad`).

**Navigation in:** Old bookmarks, legacy in-app links.
**Navigation out:** `/dashboard/access-control/user-assignment?tab=invitations` (which renders `InvitationsTabPage`).

---

## 4. Data Shapes

None.

---

## 5. Tests

**Test files:** None found.

**Not tested:** Redirect target existence, query-param preservation.

---

## 6. Notes

- File comment marks it `// LEGACY — slated for rewrite; do not extend`.
- `makeTabRedirect` lives at `@/lib/tab-redirect` and is shared with the `/access-control/permissions` redirect stub.
- The real invitation management UI is `InvitationsTabPage` (file: `apps/web/src/components/pages/access-control/invitations-tab.tsx`) rendered as the `tab=invitations` view of the Staff Access page.
- Standalone invitation list (older surface) still exists at `apps/web/src/components/invitations/invitations-page.tsx` — both wrap `CreateInvitationDialog` and share the same `client.invitations.*` API. The Phase 1 refactor only updated the `MembersTabPage` invite flow (now delegates `inviterHierarchyScopeId` resolution to the org context).
