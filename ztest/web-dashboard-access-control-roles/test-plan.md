# Test Plan: Access Control — Roles & Permissions

**Route:** `/dashboard/access-control/roles`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123 (admin role)
- Permission required: `role_management:read`
- Route delegates to `RolesTabPage` and `PermissionsTabPage` components

## Test Cases

### TC-01: Page loads — Roles tab (default)
**Trigger:** Navigate to `/dashboard/access-control/roles`
**Steps:**
1. Log in as admin, navigate to the route
2. Wait for load
**Expected:**
- Shield icon + "Roles" heading + description visible
- "Roles" and "Permissions" tab buttons visible
- "Roles" tab active by default (tab=roles)
- RolesTabPage content visible
- No console errors

### TC-02: Tab switching — switch to Permissions
**Trigger:** Click "Permissions" tab
**Steps:**
1. Navigate to `/dashboard/access-control/roles`
2. Click "Permissions" tab
**Expected:**
- URL updates to `/dashboard/access-control/roles?tab=permissions`
- PermissionsTabPage renders
- "Permissions" tab visually active (border-foreground)

### TC-03: Tab switching — switch back to Roles
**Trigger:** Click "Roles" tab
**Steps:**
1. Navigate to `?tab=permissions`
2. Click "Roles" tab
**Expected:**
- URL updates to `?tab=roles`
- RolesTabPage renders
- "Roles" tab visually active

### TC-04: Direct URL navigation to Permissions tab
**Trigger:** Navigate directly with tab param
**Steps:**
1. Navigate to `/dashboard/access-control/roles?tab=permissions`
**Expected:**
- Permissions tab active on load
- PermissionsTabPage rendered without flickering

### TC-05: Permission guard — insufficient permissions
**Trigger:** Access as staff without role_management:read
**Steps:**
1. Log in as user without role_management:read permission
2. Navigate to `/dashboard/access-control/roles`
**Expected:**
- `requirePermission()` check runs in `beforeLoad`
- Redirect to `/dashboard` (stub, may not enforce yet per MEMORY.md note about route-guards being stubs)

### TC-06: Roles tab — list roles
**Trigger:** View RolesTabPage content
**Steps:**
1. Navigate to `/dashboard/access-control/roles`
2. Wait for roles to load
**Expected:**
- List/table of roles visible
- Each role shows name, possibly permissions count

### TC-07: Permissions tab — list resources
**Trigger:** Switch to Permissions tab
**Steps:**
1. Navigate to `?tab=permissions`
2. Wait for load
**Expected:**
- Resource/permission list from `client.permissions.list` (real API, per MEMORY.md)
- Resources with their actions shown

### TC-08: Scroll region
**Trigger:** If content is long, verify scroll
**Steps:**
1. Navigate with many roles in DB
**Expected:**
- Content area scrolls without affecting page header
- Fixed header + tab band + scrollable content region

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.roles.list` (or similar in RolesTabPage) | TC-06 |
| `client.permissions.list` | TC-07 |

## Edge Cases

### EC-01: Unknown tab param
**Setup:** Navigate to `?tab=unknown`
**Expected:** `validateSearch` defaults to `"roles"`; RolesTabPage renders

### EC-02: Empty roles list
**Setup:** No custom roles created
**Expected:** Empty state UI shown (not blank/crash)

### EC-03: Empty permissions list
**Setup:** No permissions in DB
**Expected:** Empty state UI shown

## Known Gaps
- RolesTabPage component not read in detail; exact create/edit/delete actions unknown
- PermissionsTabPage detailed behavior not covered
- requirePermission is currently a stub (MEMORY.md); redirect may not actually work in dev
