# Roles Management

**Route:** `/dashboard/access-control/roles`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/roles.tsx`
**Platform:** web
**Auth required:** rbac({resource: "role_management", action: "read"})
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage organization roles and their permissions via a tabbed interface with roles and permissions visibility.

**Produces:** Two tabs:
- **Roles tab:** Lists all roles with ability to create, edit, and assign permissions
- **Permissions tab:** Shows all permission resources and their available actions

**On success:** Roles are created/updated, permissions are toggled per role.

**On failure / error states:** Permission denied if user lacks role_management:read, loading states during fetch, error toast on save failure.

---

## 2. How It Works

**Execution flow:**
1. Route guards check `role_management:read` permission in beforeLoad
2. Component renders ConsolidatedTabs UI with route-based tab switching
3. RolesTabPage queries permissions, roles, and members via oRPC
4. RoleEditor allows creating/editing roles with permission matrix
5. Mutations create roles and assign permissions via API

**Inputs:**
- URL search param: `tab` ("roles" | "permissions", defaults to "roles")

**State management:**
- TanStack Query: `["permissions", organizationId]`, `["roles", organizationId]`, `["members", organizationId]`
- Local state: selectedRoles, searchQuery, editingRole, isCreating, viewMode (cards|enhanced|wizard)
- Pending updates tracked per role-permission combo

**Outputs:**
- RoleCard grid (cards view) or EnhancedPermissionMatrix (matrix view) or Wizard (creation flow)
- Permission toggles trigger addPermission/removePermission mutations
- Role creation/updates with toasts on success/error

**Side effects:**
- onSuccess: invalidates query keys, displays toast, closes sheet
- permission changes display pending indicator and update badge count

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.permissions.list()` — fetch all permissions grouped by resource
- `client.roles.list()` — fetch all roles
- `client.members.list()` — fetch members (for role assignment counts)
- `client.roles.create()` — create new role
- `client.rolePermissions.add()` — assign permission to role
- `client.rolePermissions.remove()` — remove permission from role

**Uses these components:**
- `RolesTabPage` @ `/components/pages/access-control/roles-tab.tsx` — role management UI
- `PermissionsTabPage` @ `/components/pages/access-control/permissions-tab.tsx` — permission resource browser
- `ConsolidatedTabs` @ `/components/ui/consolidated-tabs` — tab UI

**Uses these hooks:**
- `useUserContext()` — access org ID
- `useQuery()` — fetch roles, permissions, members
- `useRoles()` — create/update role mutations

**Navigation: who navigates here:**
- Access Control menu link

**Navigation: where it goes:**
- Can navigate to user-assignment tab via breadcrumb/link

---

## 4. Data Shapes

**DB tables touched:**
- roles — read, create
- permissions — read
- role_permissions — read, create, delete
- members — read

**Key types / Zod schemas:**
- `Role` — {id, name, description, priority, permissions[]}
- `PermissionResource` — {id, name, description, icon, actions[]}
- `Permission` — {id, resource, action, description}

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Permission grant/revoke edge cases (concurrent updates, cascade effects)
- Role deletion (not exposed in UI, backend may have constraints)
- Template-based role creation flow (wizard step 1-3)
- Large permission sets (50+ resources)

---

## 6. Notes

- **viewMode** defaults to "cards" but supports "enhanced" (matrix) and "wizard" (creation flow) modes
- **Permissions-tab** shows all resources but does NOT filter by user access — assumes reader has role_management:read
- **Role priority** influences display order and hierarchy (lower number = higher priority)
- **Role templates** (Admin, Manager, Basic, ReadOnly) are hardcoded in RolesTabPage but not persisted; they guide creation
- **Quick-start guide** is dismissible and stored in local component state (not persisted across sessions)
- TODO: combobox for searching roles during permission assignment (currently free-text search only)
