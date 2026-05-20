# Roles Management

**Route:** `/dashboard/access-control/roles`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/roles.tsx`
**Platform:** web
**Auth required:** rbac({resource: "role_management", action: "read"}) via `requirePermission` guard
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Define organization roles, the permissions assigned to them, and (via the Permissions tab) browse the available permission resources.

**Produces:** A two-tab page inside a fixed shell:
- **Roles tab** (default): role list with three view modes — Cards, Matrix, Wizard. Create / edit / toggle permissions.
- **Permissions tab:** read-only permission resource browser.

**On success:** Role created or updated, permission toggled per role. Toast confirms each change. Cards/matrix views show pending-update indicators while mutations are in flight.

**On failure / error states:** Guard redirects to `/dashboard` if permission missing. Loading and empty states inside `RolesTabPage`. Error toasts on save failure.

---

## 2. How It Works

**Execution flow:**
1. `beforeLoad` runs `requirePermission({resource: "role_management", action: "read"}, "/dashboard")`.
2. Route validates `?tab=` (default `"roles"`).
3. Outer `RolesPage` renders the page shell (header + tab band) and mounts either `RolesTabPage` or `PermissionsTabPage`.
4. `RolesTabPage` runs three parallel queries (permissions, roles, members) and derives:
   - `resources` — `PermissionResource[]` grouped from flat permission list (memoized).
   - `displayRoles` — `Role[]` shaped for matrix/cards.
   - `userCounts` — members-per-role map.
5. View mode (`cards | enhanced | wizard`) drives content; wizard collects scoped checkbox state, then funnels selections into the `RoleEditor` Dialog for actual save.

**Inputs:**
- URL search: `tab`

**State management:**
- TanStack Query: `["permissions", orgId]`, `["roles", orgId]`, `["members", orgId]`
- Local: `selectedRoles`, `searchQuery`, `editingRole`, `isCreating`, `viewMode`, `showGuide`, `expandedGroups`, `wizardStep`, `selectedTemplate`, `pendingUpdates`, `wizardPermissions`
- Mutations via `useRoles(orgId)` hook: `createRole`, `addPermission`, `removePermission`

**Outputs:**
- Role grid (`RoleCard`), permission matrix (`EnhancedPermissionMatrix`), or 3-step wizard
- Permission toggle triggers `rolePermissions.add` / `rolePermissions.remove` with optimistic "pending" badge
- Role creation goes through `RoleEditor` Dialog which calls `createRole.mutateAsync` then iterates `addPermission.mutateAsync` per granted permission

**Side effects:**
- `useRoles` mutations invalidate `["roles", organizationId]` on success
- Toasts on every permission/role change

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.permissions.list({ organizationId })`
- `client.roles.list({ organizationId })`
- `client.members.list({ organizationId })` — for per-role member counts
- `client.roles.create()` (via `useRoles.createRole`)
- `client.rolePermissions.add()` (via `useRoles.addPermission`)
- `client.rolePermissions.remove()` (via `useRoles.removePermission`)

**Uses these components:**
- `RolesTabPage` @ `apps/web/src/components/pages/access-control/roles-tab.tsx`
- `PermissionsTabPage` @ `apps/web/src/components/pages/access-control/permissions-tab.tsx`
- `RoleCard`, `RoleEditor`, `EnhancedPermissionMatrix` @ `@/components/access-control/...`

**Uses these hooks:**
- `useUserContext()` — org ID
- `useQuery()`
- `useRoles(orgId)` — create/add/remove
- `useIsMobile()`
- `usePermissionMatrixState` (in `EnhancedPermissionMatrix`) — pure-reducer state for matrix view mode, role filter, search, expanded resources, batch role selection. Exports helpers `hasPermission`, `getPermissionScope`, `cycleScope`, `parseScopeValue`.
- `usePermissions` @ `apps/web/src/hooks/usePermissions.ts` — separate utility (`permissionsQuery`, `rolePermissionsQuery`, `usePermission`, `useRole`, `useCommonPermissions`); used by the auth layer, not directly by this page.

**Navigation in:** Access Control menu link.
**Navigation out:** Quick-start guide step 3 links to `/dashboard/access-control/user-assignment`.

---

## 4. Data Shapes

**DB tables touched:**
- `roles` (read, create)
- `permissions` (read)
- `role_permissions` (read, create, delete)
- `members` (read)

**Key types:**
- `Role` — `{ id, name, description?, priority, permissions: Array<{ resourceId, actionId, scope }> }`
- `PermissionResource` — `{ id, name, description, icon, actions: Action[] }`
- `Action` — `{ id, name, description? }`
- `PermissionScope` — `"own" | "team" | "organization" | "country" | "region" | "area" | "branch"`

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Permission grant/revoke concurrency (multiple toggles in flight)
- Wizard → RoleEditor handoff (initial-permissions transform)
- Large permission sets (collapse/expand performance)
- `cycleScope` four-state cycle and "higher scope cycles off" edge case
- Role templates (Admin/Manager/Basic/ReadOnly) are not persisted — UI hint only

---

## 6. Notes

- **Refactored 2026-05-12 (Web Debt Cleanup):** `RolesTabPage` query data is now typed via `Awaited<ReturnType<typeof client.x.list>>[number]` for tighter end-to-end inference; matrix view state extracted into `usePermissionMatrixState` (pure reducer + selectors).
- **viewMode default:** `cards`. Matrix mode shows `EnhancedPermissionMatrix`; wizard mode collects checkbox state then opens `RoleEditor` Dialog to actually create.
- **Role priority** — lower = higher precedence. Drives badge colour and `UserCard` "highest role" selection on the user-assignment page.
- **Role templates** (Admin / Manager / Basic / ReadOnly) are UI scaffolding only, not stored.
- **Permissions tab** does NOT filter by user access — it assumes the reader already holds `role_management:read`.
- **Quick-start guide** is dismissible per component-instance only (not persisted).
- **Deletion / duplication** of roles are no-op handlers in the cards view — backend supports neither yet.
