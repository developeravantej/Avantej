# Access Control — Role Management

**Route:** `/dashboard/access-control/roles`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/roles.tsx:1`
**Platform:** web
**Auth required:** rbac(role_management:read)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Create and manage roles, assign/remove permissions per role, and view which members hold each role. Offers three view modes: Cards, Matrix (spreadsheet), and Wizard.

**Produces:**
- **Cards view:** Grid of `RoleCard` components showing role name, description, member count, and actions.
- **Matrix view:** `EnhancedPermissionMatrix` — spreadsheet of roles × permission actions with toggles.
- **Wizard view:** 3-step flow (template → configure permissions → review) that opens `RoleEditor` on final step.
- A slide-out Sheet (`RoleEditor`) for create/edit.

**On success:**
- Permission toggle (matrix): immediate API call, success/error toast.
- Role create/edit: `RoleEditor` handles its own save; parent shows "Role saved." toast.

**On failure / error states:**
- Roles loading → spinner card "Loading roles...".
- Error loading roles → error card with "Try Again" button (page reload).
- Permission toggle error → error toast from `handlePermissionChange`.

---

## 2. How It Works

**Execution flow:**
```
RoleManagementPage
  → useUserContext() → organizationId
  → useQuery(client.permissions.list) → permissionsData
  → useQuery(client.roles.list) → rolesApiData
  → useQuery(client.members.list) → membersData (for user counts per role)
  → useMemo: group permissions → PermissionResource[]
  → useMemo: map roles → Role[]
  → useMemo: count members per role → userCounts{}
  → useRoles(organizationId) → { addPermission, removePermission }
  
  Cards: RoleCard[] with onEdit → RoleEditor Sheet
  Matrix: EnhancedPermissionMatrix → handlePermissionChange
    → addPermission.mutateAsync / removePermission.mutateAsync
  Wizard: 3-step UI → opens RoleEditor Sheet on save
```

**Inputs:** Search query (client filter), view mode tab selection.

**State management:**
- `viewMode`: "cards" | "enhanced" | "wizard" — local state.
- `editingRole`, `isCreating` — controls Sheet open/closed.
- `selectedRoles` — Set of selected role IDs (for multi-select, not currently wired to bulk action).
- `pendingUpdates` — Set of in-flight permission update keys (shows progress indicator in matrix view).
- `wizardPermissions` — Record tracking checked state in wizard step 2.
- `showGuide` — toggles Quick Start Guide card.

**Side effects:** `addPermission` / `removePermission` mutations invalidate `rolePermissions.list` query key.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `permissions.list` — fetch all permission resources+actions
- `roles.list` — fetch all roles for org
- `members.list` — fetch members to compute per-role user counts
- `rolePermissions.add` — assign a permission to a role (via `useRoles`)
- `rolePermissions.remove` — remove a permission from a role (via `useRoles`)
- `roles.create`, `roles.update`, `roles.delete` — available via `useRoles` but delegated to `RoleEditor`

**Uses these components:**
- `RoleCard` — `apps/web/src/components/access-control/permission-cards/RoleCard.tsx` — card per role
- `RoleEditor` — `apps/web/src/components/access-control/editors/RoleEditor.tsx` — create/edit form in Sheet
- `EnhancedPermissionMatrix` — `apps/web/src/components/access-control/permission-matrix/EnhancedPermissionMatrix.tsx` — matrix view

**Uses these hooks:**
- `useUserContext` — resolves `organizationId`
- `useRoles` — `apps/web/src/hooks/useRoles.ts` — CRUD + permission mutations for roles
- `useIsMobile` — grid column count

**Navigation: who navigates here:**
- App sidebar: "Role Management" under Access Control section
- Quick Start Guide on this page links to `/dashboard/access-control/user-assignment`

**Navigation: where it goes:**
- Guide CTA → `/dashboard/access-control/user-assignment` (hard anchor `<a>`)

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `permissions` (tenant) | SELECT | `id`, `resource`, `action`, `description` |
| `roles` (tenant) | SELECT/INSERT/UPDATE/DELETE | `id`, `name`, `description`, `priority` |
| `role_permissions` (tenant) | SELECT/INSERT/DELETE | `roleId`, `permissionId` |
| `members` (tenant) | SELECT | `id`, `role` (for user count) |

**Key types:**
```typescript
type Role = { id: string; name: string; description?: string; priority: number; permissions: [] }
type PermissionResource = { id: string; name: string; icon; actions: { id; name; description? }[] }
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Wizard "Save Role" step — currently re-opens RoleEditor without wiring wizard permissions into it
- `handleDeleteRole` and `handleDuplicateRole` are no-ops
- Member count derivation (matches by role name string, not ID)
- Concurrent permission toggles in matrix view

---

## 6. Notes

- `handleDeleteRole` and `handleDuplicateRole` are intentionally stubbed (no-op) — deletion must go through `useRoles.deleteRole` which is wired but not exposed in the UI.
- Member-to-role count matching is done by comparing role name strings case-insensitively, because `members.list` returns a `role` string field, not a role ID.
- The wizard step 3 "Save Role" button resets wizard state and opens `RoleEditor` — the wizard-selected permissions are **not** automatically applied; it only pre-selects the template.
- `ROLE_TEMPLATES` are UI-only presets; selecting one does not pre-populate permissions in the RoleEditor.
- `requirePermission` in `beforeLoad` is currently a stub.
