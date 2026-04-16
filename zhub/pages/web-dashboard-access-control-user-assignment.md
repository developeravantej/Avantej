# Access Control — User Role Assignment

**Route:** `/dashboard/access-control/user-assignment`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/user-assignment.tsx:1`
**Platform:** web
**Auth required:** rbac(user_management:read) + rbac(role_management:read)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Assign system roles to members, change hierarchy scope, activate/deactivate members, and invite new users.

**Produces:** Stats cards (total/active users, users without roles, available roles), a searchable/filterable grid of `UserCard` components, a `RoleAssignmentSheet`, an `InviteUserDialog`, and an "Edit User" dialog that updates role + hierarchy scope.

**On success:**
- Role update → toast "Successfully updated role for {name}"; member list refreshes.
- Deactivate/reactivate → toast with status; member list refreshes.
- Invite → toast "Invitation sent to {email}" (or warning if email failed but record was created).

**On failure / error states:**
- Loading → full-screen overlay spinner during any mutation.
- Role update error → destructive toast.
- Invite with no hierarchy scope → toast "Unable to determine your hierarchy scope."
- API error → destructive toast.

---

## 2. How It Works

**Execution flow:**
```
UserAssignmentPage
  → useUserContext() → organizationId + inviterHierarchyScopeId
  → useQuery(client.members.list) → membersApiData
  → useQuery(client.roles.list) → rolesApiData
  → useQuery(client.hierarchy.listNodes) → hierarchyNodes (for edit dialog)
  → UserCard[] (filtered by search/role/status)

  Edit Roles → RoleAssignmentSheet:
    → client.members.updateRole()
    → invalidate ["members", organizationId]

  Edit User Details → Dialog:
    → client.members.updateRole()
    → client.hierarchy.reassignMember() (if scope changed)
    → invalidate ["members", organizationId]

  Deactivate/Reactivate:
    → client.members.deactivate() or client.members.reactivate()
    → invalidate ["members", organizationId]

  Invite User → InviteUserDialog:
    → client.invitations.create()
    → client.invitations.sendEmail()
    → invalidate ["members", organizationId]
```

**Inputs:**
- Search query (name, email, department)
- Role filter dropdown (all / no-role / per-role-id)
- Status filter dropdown (all / active / inactive)

**State management:**
- `users` — local state populated from `membersApiData` via `useEffect`.
- `selectedUsers` — Set for bulk selection (UI exists but bulk actions are not wired).
- `editingUser`, `editingUserDetails`, `showInviteDialog` — controls sheets/dialogs.

**Side effects:**
- `invitations.sendEmail` triggers transactional email (server-side Resend).
- All mutations invalidate the `["members", organizationId]` query.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `members.list` — list members with user details
- `members.updateRole` — change a member's system role
- `members.deactivate` — set member status to inactive
- `members.reactivate` — restore member status to active
- `hierarchy.listNodes` — fetch hierarchy nodes for scope picker
- `hierarchy.reassignMember` — change member's hierarchy scope
- `invitations.create` — create invitation record
- `invitations.sendEmail` — send invitation email (server-only)

**Uses these components:**
- `UserCard` — inline component — card per member with dropdown actions
- `RoleAssignmentSheet` — inline component — Sheet for role selection
- `InviteUserDialog` — inline component — Sheet for email + role invitation
- Edit User Dialog — inline Dialog with role + hierarchy scope selectors

**Uses these hooks:**
- `useUserContext` — resolves `organizationId` and inviter's `hierarchyScopeId`
- `useIsMobile` — grid column count

**Navigation: who navigates here:**
- App sidebar: "User Assignment" under Access Control section
- Roles page Quick Start Guide CTA links here

**Navigation: where it goes:** Stays on page.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `members` (tenant) | SELECT | `id`, `userId`, `name`, `email`, `status`, `role`, `hierarchyScopeId` |
| `members` (tenant) | UPDATE | `status`, `role` |
| `hierarchy_nodes` (tenant) | SELECT | `id`, `name`, `type`, `depth` |
| `invitations` (tenant) | INSERT | `email`, `role`, `hierarchyScopeId` |

**Form fields (Edit User dialog):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| Role | Select (admin/trainer/staff/client) | Required | `members.updateRole` |
| Hierarchy Scope | Select from hierarchy nodes | Optional | `hierarchy.reassignMember` |

**Form fields (Invite User):**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| Email | Email input | Required, valid email | `invitations.create.email` |
| Role | Select (admin/trainer/staff/client) | Default: staff | `invitations.create.role` |

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Bulk actions UI (visible but not wired to any API)
- Invitation email failure path (warning toast + record still created)
- `useEffect` resetting `users` state on `membersApiData` change (potential stale render)

---

## 6. Notes

- Bulk action dropdown items ("Bulk Assign Role", "Deactivate Selected") exist in the UI but are no-ops — no mutation is attached to them.
- `users` is managed as a local state copy of `membersApiData` via `useEffect` — this means there is a render cycle before the list updates after mutations.
- The `UserCard.roles` array is always empty (`[]`) because `membersApiData` doesn't return role IDs; user roles are mapped from the string `member.role` field instead. The role badge display logic falls back to the `highestRole` from `userRoles` (derived from `user.roles`) which is always empty — resulting in no role badge shown on cards.
- Two `requirePermission` guards run in `beforeLoad` sequentially; both are currently stubs.
