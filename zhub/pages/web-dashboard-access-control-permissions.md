# Access Control — Permission Management

**Route:** `/dashboard/access-control/permissions`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/permissions.tsx:1`
**Platform:** web
**Auth required:** rbac(role_management:read)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** View all permission resources and their available actions, and bulk-remove all role assignments for an entire resource.

**Produces:** Stats cards (resource count, total actions, avg actions/resource), a search-filtered grid of resource cards, and a confirmation dialog for removing all role-permission assignments for a resource.

**On success:** "Remove All Permissions" → toast with count removed; query cache invalidated.

**On failure / error states:**
- Loading → spinner card with "Loading permissions..."
- No match for search → empty-state card with "No resources found"
- Remove error → destructive toast with error message.

---

## 2. How It Works

**Execution flow:**
```
PermissionManagementPage
  → useUserContext() → organizationId
  → useQuery(client.permissions.list) → flat permission records
  → useQuery(client.rolePermissions.list) → role-permission assignments
  → useMemo: group permissions by resource → PermissionResource[]
  → filteredResources (search filter on client)
  → ResourceCard[] (with "Remove All Permissions" dropdown)
  → handleConfirmRemovePermissions:
      → find permissionIds for resource
      → find rolePermission assignments for those permissionIds
      → Promise.all(client.rolePermissions.remove per assignment)
      → invalidate ["rolePermissions", organizationId]
```

**Inputs:** Search query (client-side filter on resource name, description, action names).

**State management:**
- `searchQuery` — local state for filtering.
- `confirmResource` — local state for which resource is being bulk-removed.
- `isRemoving` — local boolean during bulk removal.

**Outputs:** Read-only resource cards with action badges. One destructive action (remove all role assignments for a resource).

**Side effects:** Cache invalidation of `["rolePermissions", organizationId]` after removal.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `permissions.list` — list all permission records for the org (`{ organizationId }`)
- `rolePermissions.list` — list all role-permission assignments (`{ organizationId }`)
- `rolePermissions.remove` — remove a single role-permission assignment (`{ organizationId, roleId, permissionId }`)

**Uses these components:**
- `ResourceCard` — inline component — renders a card per resource with action badges and a remove dropdown

**Uses these hooks:**
- `useUserContext` — resolves `organizationId`
- `useQuery`, `useQueryClient` — data fetching and cache management
- `useIsMobile` — controls grid column count

**Navigation: who navigates here:**
- App sidebar: "Permissions" under Access Control section

**Navigation: where it goes:** Stays on page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `permissions` (tenant) | SELECT | `id`, `resource`, `action`, `description` |
| `role_permissions` (tenant) | SELECT | `roleId`, `permissionId` |
| `role_permissions` (tenant) | DELETE | `roleId`, `permissionId` |

**Key types:**
```typescript
// Flat permission record from API
{ id: string; resource: string; action: string; description?: string }

// Grouped into PermissionResource for display
type PermissionResource = {
  id: string; name: string; description: string;
  icon: ComponentType; actions: { id: string; name: string; description?: string }[];
}
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Bulk remove with concurrent API calls
- Partial failure in `Promise.all` (one removal fails)
- Search filtering edge cases (empty results vs no data)

---

## 6. Notes

- This page is **read-only for the permission catalog** — it cannot add new permissions or actions, only remove role-to-permission assignments in bulk.
- The icon map (`RESOURCE_ICON_MAP`) only covers a subset of resource identifiers; unlisted resources fall back to `Shield`.
- `formatActionName` maps known CRUD actions to human-readable labels; unknown actions are title-cased.
- Removing all permissions for a resource does not delete the permission records themselves — only the `role_permissions` join entries are deleted.
