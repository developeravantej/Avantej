# Dead Code & Duplicates Audit

**Date:** 2026-04-16
**Branch:** Customer-app

## Summary

| Category | Count |
|----------|-------|
| Legacy/Duplicate Routes | 4 |
| Unreachable Pages | 2 |
| Unused Service Exports | 9 |
| Unregistered Routers | 0 |
| Orphan Components | 11 |
| Duplicate Logic | 3 |
| **Total** | **29** |

---

## Legacy/Duplicate Routes

### [MEDIUM] Legacy `/appointment/view` route duplicates dashboard version
- **File:** `apps/web/src/routes/_authenticated/appointment/view.tsx`
- **Status:** KNOWN
- **What's wrong:** This top-level authenticated route duplicates `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/view.tsx`. Both render appointment calendars.
- **What to do:** Delete the legacy route file and update any remaining links to use `/dashboard/appointment/view`.

### [MEDIUM] Legacy `/service/view` route duplicates dashboard version
- **File:** `apps/web/src/routes/_authenticated/service/view.tsx`
- **Status:** KNOWN
- **What's wrong:** Duplicates `apps/web/src/routes/_authenticated/dashboard/_layout/service/view.tsx`.
- **What to do:** Delete the legacy route file. No sidebar links point to the legacy path.

### [MEDIUM] Legacy `/service-category/view` route duplicates dashboard version
- **File:** `apps/web/src/routes/_authenticated/service-category/view.tsx`
- **Status:** KNOWN
- **What's wrong:** Duplicates `apps/web/src/routes/_authenticated/dashboard/_layout/service-category/view.tsx`.
- **What to do:** Delete the legacy route file.

### [MEDIUM] Legacy `/user/view` route duplicates dashboard version
- **File:** `apps/web/src/routes/_authenticated/user/view.tsx`
- **Status:** KNOWN
- **What's wrong:** Duplicates `apps/web/src/routes/_authenticated/dashboard/_layout/user/view.tsx`.
- **What to do:** Delete the legacy route file.

---

## Unreachable Pages

### [LOW] Sales detail page only reachable by direct URL
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx`
- **Status:** KNOWN
- **What's wrong:** The Sales View page (`/dashboard/sales/view`) has "View" buttons that are `console.log` stubs. The `$id` detail route exists but no navigation link or button actually points to it.
- **What to do:** Wire the View button in the Sales table to navigate to `/dashboard/sales/${id}`.

### [LOW] GoHighLevel integration page is sidebar-linked but marked as demo
- **File:** `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx`
- **Status:** NEW
- **What's wrong:** Sidebar links to `/go-highlevel-integration`. The page is self-described as a demo, uses raw `fetch` (not oRPC), has no RBAC guard, and is outside the dashboard layout.
- **What to do:** Either move into dashboard layout with RBAC or remove from sidebar if it is not production-ready.

---

## Unused Service Exports

### [LOW] `getAncestorNodeIds` exported but never imported
- **File:** `packages/services/src/hierarchy.service.ts`
- **Status:** NEW
- **What's wrong:** Exported from `index.ts` but not imported by any router, server file, or app code outside its own package.
- **What to do:** Keep if planned for future use; otherwise remove from `index.ts` exports.

### [LOW] `markExpiredInvitations` exported but never imported
- **File:** `packages/services/src/invitation.service.ts`
- **Status:** NEW
- **What's wrong:** Exported but never consumed by any router or cron job.
- **What to do:** Wire to a scheduled job or remove.

### [LOW] `getDepthForType` and `getParentTypeForType` exported but unused outside package
- **File:** `packages/services/src/hierarchy-validation.service.ts`
- **Status:** NEW
- **What's wrong:** Only used internally within the services package (`hierarchy.service.ts` imports `getDepthForType`). `getParentTypeForType` is not used anywhere outside its own file.
- **What to do:** Remove from `index.ts` re-exports; keep as internal helpers.

### [LOW] `resolveBufferTime` exported but only used internally
- **File:** `packages/services/src/buffer-time.service.ts`
- **Status:** NEW
- **What's wrong:** Only consumed by `appointment.service.ts` within the same package. Not imported by any router or app code.
- **What to do:** Remove from `index.ts` re-exports; keep as internal helper.

### [LOW] `checkAppointmentBufferConflict` exported but only used internally
- **File:** `packages/services/src/buffer-time.service.ts`
- **Status:** NEW
- **What's wrong:** Only consumed by `appointment.service.ts` within the same package.
- **What to do:** Remove from `index.ts` re-exports.

### [LOW] `calculateCreditsUnlocked` exported but never consumed
- **File:** `packages/services/src/installment.service.ts`
- **Status:** NEW
- **What's wrong:** Exported from `index.ts` but not imported by any router. Only referenced within its own service file and test.
- **What to do:** Remove from `index.ts` or wire to a router procedure.

### [LOW] `calculateInstallmentAmounts` exported but never consumed
- **File:** `packages/services/src/installment.service.ts`
- **Status:** NEW
- **What's wrong:** Same as above. Utility function exported but no router or app code uses it.
- **What to do:** Remove from `index.ts` or wire to a router procedure.

### [LOW] `calculateSuggestedRefund` exported but never consumed
- **File:** `packages/services/src/installment.service.ts`
- **Status:** NEW
- **What's wrong:** Exported from `index.ts` but not imported by any router. The router uses `getSuggestedRefund` instead, which calls this internally.
- **What to do:** Remove from `index.ts` re-exports; keep as internal helper.

### [LOW] `getGracePeriodDaysForPackage` exported but never consumed outside package
- **File:** `packages/services/src/installment.service.ts`
- **Status:** NEW
- **What's wrong:** Only used by test file; no router imports it.
- **What to do:** Remove from `index.ts` or wire if needed.

---

## Unregistered Routers

No unregistered routers found. All 46 router files in `packages/api/src/routers/` are registered in `baseRouter`. All 3 server-specific routers (`auth`, `invitations`, `admin`) in `apps/server/src/routers/` are merged into `appRouter` in `apps/server/src/index.ts`.

---

## Orphan Components

### [MEDIUM] `nav-main.tsx` is never imported
- **File:** `apps/web/src/components/nav-main.tsx`
- **Status:** NEW
- **What's wrong:** Superseded by `app-sidebar.tsx`. Zero imports across the codebase.
- **What to do:** Delete.

### [MEDIUM] `nav-projects.tsx` is never imported
- **File:** `apps/web/src/components/nav-projects.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. Likely a shadcn/ui scaffold leftover.
- **What to do:** Delete.

### [MEDIUM] `nav-user.tsx` is never imported
- **File:** `apps/web/src/components/nav-user.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. Superseded by `SidebarUserFooter` in `app-sidebar.tsx`.
- **What to do:** Delete.

### [MEDIUM] `team-switcher.tsx` is never imported
- **File:** `apps/web/src/components/team-switcher.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. Scaffold leftover.
- **What to do:** Delete.

### [LOW] `sign-in-form.tsx` is never imported
- **File:** `apps/web/src/components/sign-in-form.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. The `(auth)/login.tsx` route uses `login-form.tsx` instead.
- **What to do:** Delete.

### [LOW] `sign-up-form.tsx` is never imported
- **File:** `apps/web/src/components/sign-up-form.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports from routes or components. The `(auth)/signup.tsx` and `accept-invitation.tsx` use `signup-form.tsx` instead.
- **What to do:** Delete (not the same as `signup-form.tsx` which IS used).

### [LOW] `mode-toggle.tsx` is never imported
- **File:** `apps/web/src/components/mode-toggle.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. Dark mode toggle component with no consumer.
- **What to do:** Delete unless dark mode support is planned.

### [LOW] `user-menu.tsx` is never imported
- **File:** `apps/web/src/components/user-menu.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. Superseded by sidebar user footer.
- **What to do:** Delete.

### [LOW] `buttons/logout-button.tsx` is never imported
- **File:** `apps/web/src/components/buttons/logout-button.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. Logout is handled in `app-sidebar.tsx` footer.
- **What to do:** Delete.

### [LOW] `forms/enhanced-product-form.tsx` is never imported
- **File:** `apps/web/src/components/forms/enhanced-product-form.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. `product-form.tsx` is used instead (imported by products data-table).
- **What to do:** Delete.

### [LOW] `forms/uom-form.tsx` is never imported
- **File:** `apps/web/src/components/forms/uom-form.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. UoM CRUD is handled inline in the route page or data-table.
- **What to do:** Delete.

### [LOW] `access-control/editors/PermissionEditor.tsx` is never imported
- **File:** `apps/web/src/components/access-control/editors/PermissionEditor.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. The permissions page uses `PermissionMatrix` instead.
- **What to do:** Delete.

### [LOW] `access-control/mobile/MobileRoleSheet.tsx` is never imported
- **File:** `apps/web/src/components/access-control/mobile/MobileRoleSheet.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. Mobile responsive component never wired in.
- **What to do:** Delete.

### [LOW] `access-control/mobile/PermissionSelector.tsx` is never imported
- **File:** `apps/web/src/components/access-control/mobile/PermissionSelector.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports.
- **What to do:** Delete.

### [LOW] `access-control/mobile/BulkAssignmentSheet.tsx` is never imported
- **File:** `apps/web/src/components/access-control/mobile/BulkAssignmentSheet.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports.
- **What to do:** Delete.

### [LOW] `access-control/permission-cards/PermissionCard.tsx` is never imported
- **File:** `apps/web/src/components/access-control/permission-cards/PermissionCard.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. Alternative permission display never wired in.
- **What to do:** Delete.

### [LOW] `merge-tables/unit-of-measure-dashboard.tsx` is never imported
- **File:** `apps/web/src/components/merge-tables/unit-of-measure-dashboard.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. The UoM pages have their own dedicated route files.
- **What to do:** Delete.

### [LOW] `ui/switch.tsx` is never imported
- **File:** `apps/web/src/components/ui/switch.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. UI primitive with no consumer.
- **What to do:** Keep if planned for use; otherwise delete.

### [LOW] `tables/packages/view/columns.tsx` is never imported
- **File:** `apps/web/src/components/tables/packages/view/columns.tsx`
- **Status:** NEW
- **What's wrong:** Zero imports. The old `/packages/view.tsx` route was deleted (visible in git status as `D`), but its column definitions remain.
- **What to do:** Delete.

---

## Duplicate Logic

### [MEDIUM] Hierarchy service duplicated between packages and server
- **File:** `apps/server/src/services/hierarchy.service.ts` duplicates `packages/services/src/hierarchy.service.ts`
- **Status:** NEW
- **What's wrong:** Both files implement `getDescendantNodeIds`, `createHierarchyNode`, etc. The server copy is used by `apps/server/src/routes/hierarchy.routes.ts` while the package copy is used by `packages/api/src/routers/hierarchy.ts`. Two parallel implementations of the same business logic.
- **What to do:** Remove the server copy and have server routes import from `@avantej-core/services`.

### [MEDIUM] Hierarchy validation service duplicated between packages and server
- **File:** `apps/server/src/services/hierarchy-validation.service.ts` duplicates `packages/services/src/hierarchy-validation.service.ts`
- **Status:** NEW
- **What's wrong:** Both files implement `validateHierarchyRules`, `validateParentAccess`, `getDepthForType`. The server copy is consumed by server-side hierarchy routes.
- **What to do:** Remove the server copy and import from `@avantej-core/services`.

### [MEDIUM] Permission service duplicated between packages and server
- **File:** `apps/server/src/services/permission.service.ts` duplicates `packages/services/src/permission.service.ts`
- **Status:** NEW
- **What's wrong:** Both implement `hasPermission` and RBAC checks. The server copy has a smaller `Resource` type (4 resources) while the packages copy has 11+ resources. They have diverged.
- **What to do:** Remove the server copy. Its callers should import from `@avantej-core/services` to use the canonical, more complete version.
