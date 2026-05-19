# User Role Assignment

**Route:** `/dashboard/access-control/user-assignment`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/user-assignment.tsx`
**Platform:** web
**Auth required:** authenticated (no explicit RBAC guard in `beforeLoad`)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Assign system + custom roles to organization members, reassign hierarchy scope, deactivate / reactivate users, and invite new ones.

**Produces:** Page shell with two tabs:
- **Members tab** (default): user cards with current roles, last-login, edit/deactivate dropdown, and an Invite User CTA.
- **Invitations tab:** pending/accepted/declined/expired invitation management.

**On success:** Members refetched, role changes / status / hierarchy persisted, invitation email dispatched.

**On failure / error states:** Toasts on mutation failure. Email-send failure shows a warning toast but the invitation row is still created. If the inviter's `hierarchyScopeId` cannot be resolved, the invite flow short-circuits with an error toast.

---

## 2. How It Works

**Execution flow:**
1. Outer `StaffAccessPage` validates `?tab=` (default `"members"`) and renders either `MembersTabPage` or `InvitationsTabPage` inside a fixed shell.
2. `MembersTabPage` runs three parallel queries: members, roles, hierarchy nodes.
3. Members API rows are normalized into a local `UserForAssignment[]` (split name into first/last, map system-role text → matching role.id list).
4. Filter pipeline: search → role filter → status filter → render `UserCard` grid.
5. Actions: edit roles (dialog: system role + custom role.id + hierarchy scope), deactivate, invite.
6. Invite resolves the inviter's `hierarchyScopeId` from `userContext.organizations[].hierarchy.member.hierarchyScopeId` and passes it to `client.invitations.create` (then best-effort `sendEmail`).

**Inputs:**
- URL search: `tab`

**State management:**
- TanStack Query: `["members", orgId]`, `["roles", orgId]`, `["hierarchy", "nodes", orgId]`
- Local: `users` (mirrored from API), `selectedUsers`, `searchQuery`, `roleFilter`, `statusFilter`, `editingUser`, `editingUserDetails`, `editRole`, `editRoleId`, `editHierarchyScopeId`, `showInviteDialog`, `isSaving`
- Notable empty-array refs `EMPTY_MEMBERS` / `EMPTY_ROLES` to keep referential stability across renders (prevents unnecessary `useEffect` re-runs).

**Outputs / mutations:**
- `client.members.updateRole({ organizationId, memberId, newRole, roleId? })`
- `client.members.deactivate({ organizationId, memberId })`
- `client.members.reactivate({ organizationId, memberId })`
- `client.hierarchy.reassignMember({ organizationId, memberId, newHierarchyScopeId })`
- `client.invitations.create({ organizationId, email, role, hierarchyScopeId })` + `client.invitations.sendEmail(...)`

**Side effects:**
- All mutations invalidate `["members", organizationId]`
- Invite uses inviter's own `hierarchyScopeId` as the default scope for the invitee
- `client.invitations.sendEmail` failure shows warning toast but does NOT roll back the created invitation

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.members.list`, `updateRole`, `deactivate`, `reactivate`
- `client.roles.list`
- `client.hierarchy.listNodes`, `reassignMember`
- `client.invitations.create`, `sendEmail`
- (Invitations tab) `client.invitations.list`, `revoke`, `resend`

**Uses these components:**
- `MembersTabPage` @ `apps/web/src/components/pages/access-control/members-tab.tsx` (refactored to type query data via `Awaited<ReturnType<typeof client.x.list>>[number]`)
- `InvitationsTabPage` @ `apps/web/src/components/pages/access-control/invitations-tab.tsx`
- `UserCard`, `RoleAssignmentSheet`, `InviteUserDialog` — local helpers inside `members-tab.tsx`
- `CreateInvitationDialog` @ `apps/web/src/components/invitations/create-invitation-dialog.tsx` (used by the standalone invitations page — not by the in-tab invite flow, which has its own minimal dialog)

**Uses these hooks:**
- `useUserContext()` — for `currentOrganizationId` and the inviter's `hierarchyScopeId` (`currentOrg?.hierarchy.member?.hierarchyScopeId`)
- `useQuery()`, `useQueryClient()`
- `useIsMobile()` — responsive grid

**Navigation in:** Access Control menu, plus the legacy `/dashboard/access-control/invitations` redirect.
**Navigation out:** Quick-start guide on Roles page links here.

---

## 4. Data Shapes

**DB tables touched:**
- `members` (read, update role, status, hierarchy scope, optional `roleId` FK)
- `roles` (read)
- `hierarchy_nodes` (read, used for scope picker)
- `invitations` (create)
- Email send is via the server-only invitation email router (Resend)

**Key types:**
- `UserForAssignment` — `{ id, name, firstName, lastName, email, roles: string[], isActive, lastLogin?, department? }`
- `RoleResponse` — `{ id, name, description?, priority }`
- `HierarchyNode` — `{ id, name, type, depth, parentId, address, picUserId, createdAt, updatedAt }`
- `SystemRole` — `"admin" | "trainer" | "staff" | "client"` (hardcoded `SYSTEM_ROLES` array with `label` + `description`)
- `member.role` (text fast-path) + `member.roleId` (FK to `roles` row for custom roles) — both editable independently in the edit dialog.

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Custom-role + system-role dual-write semantics (`updateRole` with both `newRole` and `roleId`)
- Email-send failure leaving an orphan unsent invitation
- Bulk action UI (placeholders only, disabled in code)
- Concurrent member updates (no optimistic UI; relies on full refetch)
- Inviter `hierarchyScopeId` resolution failure path

---

## 6. Notes

- **Refactored 2026-05-12 (Web Debt Cleanup):** `MembersTabPage` query callbacks now return `Promise<Awaited<ReturnType<typeof client.x.list>>>` to keep oRPC inference end-to-end; static `EMPTY_MEMBERS`/`EMPTY_ROLES` arrays added to stabilize `useEffect` deps.
- **No RBAC `beforeLoad` guard** — permission checks happen inside the component. Inviting still requires the inviter to have a resolvable `hierarchyScopeId`, which acts as a soft guard for unscoped users.
- **System roles hardcoded** — `admin | trainer | staff | client`. Custom roles (created on the Roles tab) attach via the optional `roleId` FK in the edit dialog.
- **Bulk actions** — checkbox + dropdown UI is present but every menu item is disabled with `title="Bulk actions coming soon"`.
- **Email-send is best-effort** — failure toast warns user but invitation is still in DB; resend available from the Invitations tab.
- **Last login** is rendered via a relative-time formatter on the client; no server support.
- **Member role mapping** — when the API returns `member.role` (text), it's matched case-insensitively to `roles[].name` to derive role IDs for display.

---

## Related Pages

- [Roles Management](/dashboard/access-control/roles)
