# Access Control — User Role Assignment

**Route:** `/_authenticated/dashboard/_layout/access-control/user-assignment`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/user-assignment.tsx:1`
**Platform:** web
**Auth required:** rbac(user_management:read, role_management:read) — `requirePermission` in `beforeLoad` is a stub; actual enforcement is server-side.
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Manage all organization members — assign system roles, change hierarchy scope, deactivate/reactivate accounts, and invite new users by email.
**Produces:** A card grid of member records showing name, email, current role badge, active/inactive status, and relative last-login time.
**On success:** Role updates, deactivate/reactivate, and invitations each show a sonner toast and re-fetch the members list.
**On failure / error states:** Full-screen loading overlay while fetching. Toast errors on mutation failure. Empty-state card when no users match filters. Invite blocked with error toast when inviter's `hierarchyScopeId` cannot be resolved from user context.

---

## 2. How It Works

**Execution flow:**
```
UserAssignmentPage
  → useQuery(["members", orgId])     → client.members.list({ organizationId })
  → useQuery(["roles", orgId])       → client.roles.list({ organizationId })
  → useQuery(["hierarchy","nodes"])  → client.hierarchy.listNodes({ organizationId })

  handleSaveUserRoles(newRole)
    → client.members.updateRole({ organizationId, memberId, newRole })
        → MembershipService.updateMemberRole (dual-write: tenant + control panel)

  handleDeactivateUser(userId)
    → client.members.deactivate(...)   [tenant-only status change]
    OR client.members.reactivate(...)  [dual-write via MembershipService]

  handleInviteUser(email, role)
    → client.invitations.create({ organizationId, email, role, hierarchyScopeId })
    → client.invitations.sendEmail({ invitation, organizationId, ... })
        [best-effort: email failure shows warning toast, not error; invite is still created]

  handleSaveUserDetails()
    → client.members.updateRole(...)
    → client.hierarchy.reassignMember({ organizationId, memberId, newHierarchyScopeId })
        [only if editHierarchyScopeId is non-empty]
```

**Inputs:** No URL or query params. Inviter's `hierarchyScopeId` derived from `userContext.organizations[currentOrg].hierarchy.member.hierarchyScopeId`.

**State management:**
- `users` — local copy of members synced from API via `useEffect` on `membersApiData` (one-tick lag on first render)
- `selectedUsers` — Set of IDs for bulk-select UI (bulk actions are stubs only)
- `searchQuery`, `roleFilter`, `statusFilter` — client-side filtering, no server round-trip
- `editingUser` — opens `RoleAssignmentSheet`
- `editingUserDetails` — opens "Edit User" Dialog
- `showInviteDialog` — opens `InviteUserDialog` Sheet
- `isSaving` — disables all mutation buttons during any in-flight call

**Outputs:** Card grid renders with filters and stats. Mutations invalidate `["members", orgId]` on success.
**Side effects:** Invitation email via server-side Resend; failure is non-blocking.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `members.list` — fetch members (cross-DB enriched with name/email from control panel)
- `members.updateRole` — change system role (dual-write)
- `members.deactivate` — tenant-only status → inactive
- `members.reactivate` — restore active (dual-write)
- `roles.list` — available roles for filter/badges
- `hierarchy.listNodes` — populate hierarchy scope selector
- `hierarchy.reassignMember` — move member to different node
- `invitations.create` — create invitation record
- `invitations.sendEmail` — server-side email trigger

**Uses these components:** `UserCard`, `RoleAssignmentSheet`, `InviteUserDialog` (all defined inline in same file). Shadcn/ui: `Card`, `Sheet`, `Dialog`, `Select`, `Checkbox`, `Badge`, `Avatar`, `DropdownMenu`.

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId` + inviter's `hierarchyScopeId`
- `useIsMobile` — Sheet slides from bottom on mobile, right on desktop
- `useQueryClient` — manual cache invalidation

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — People → Access Control → "User Assignment" (sidebar link is permission-gated: requires `user_management:read`; hidden when the user lacks this permission)

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `members` (tenant) | SELECT, UPDATE | `id`, `userId`, `role`, `status`, `hierarchyScopeId` |
| `user` (control panel) | SELECT | `id`, `name`, `email` |
| `roles` (tenant) | SELECT | `id`, `name`, `priority` |
| `hierarchy_nodes` (tenant) | SELECT | `id`, `name`, `type`, `depth` |
| `invitations` (tenant) | INSERT | `email`, `role`, `hierarchyScopeId`, `token`, `status` |
| `organization_members` (control panel) | UPDATE | `role`, `status` |

**Key types:**
- `UserForAssignment` — `{ id, name, email, roles: string[], isActive, department? }` from `apps/web/src/types/user-assignment.ts`
- `RoleResponse` — `{ id, name, description?, priority }` from same file
- `SystemRole` — `"admin" | "trainer" | "staff" | "client"` (inline)

**Form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| email | text input | required (toast guard) | `invitations.create.email` |
| role (invite) | Select SystemRole | default "staff" | `invitations.create.role` |
| role (edit) | Select SystemRole | default "staff" | `members.updateRole.newRole` |
| hierarchyScopeId | Select from hierarchy nodes | optional | `hierarchy.reassignMember.newHierarchyScopeId` |

---

## 5. Tests

**Test files:** None found.
**Scenarios covered:** N/A
**Not tested (risk areas):**
- Two-step invite with email failure fallback
- Deactivate vs reactivate toggle when `user.isActive` changes between renders
- Null `inviterHierarchyScopeId` blocking invite silently
- Bulk action menu items (stubs — no mutations wired)

---

## 6. Notes

- `requirePermission` in `beforeLoad` is a client-side stub and does not block navigation. Real RBAC is enforced in each server procedure.
- `members.deactivate` (tenant-only) and `members.reactivate` (dual-write) are asymmetric — a bug risk if the two get out of sync.
- The `users` local state array is populated in a `useEffect`, so stats cards show `0` on the initial render tick before the effect runs.
- `UserCard` shows "No roles assigned" for every member because `initialUsers` maps all members to `roles: []`. The `roles` array on `UserForAssignment` is never populated from the API (the members endpoint does not return role IDs). This is a known data mismatch.
- Bulk actions ("Bulk Assign Role", "Deactivate Selected") are UI-only — clicking them does nothing.
