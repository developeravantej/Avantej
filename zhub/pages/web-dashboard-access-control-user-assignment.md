# User Role Assignment

**Route:** `/dashboard/access-control/user-assignment`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/user-assignment.tsx`
**Platform:** web
**Auth required:** authenticated (no explicit RBAC guard in beforeLoad)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Assign roles to organization members and manage invitations.

**Produces:** Two tabs:
- **Members tab:** Lists all active members with their assigned roles, allows editing roles and inviting new users
- **Invitations tab:** Manages pending invitations

**On success:** Users are assigned roles, deactivated/reactivated, or invited with email notification.

**On failure / error states:** Permission denied (checked in component), loading spinners, error toasts on mutation failure.

---

## 2. How It Works

**Execution flow:**
1. Component renders ConsolidatedTabs with route-based tab selection
2. MembersTabPage queries members, roles, and hierarchy nodes
3. User cards show current roles and last login info
4. Invite/Edit/Deactivate flows open sheets/dialogs
5. Mutations call client.members.updateRole, client.invitations.create, etc.

**Inputs:**
- URL search param: `tab` ("members" | "invitations", defaults to "members")

**State management:**
- TanStack Query: `["members", organizationId]`, `["roles", organizationId]`, `["hierarchy", "nodes", organizationId]`
- Local state: users[], selectedUsers, searchQuery, roleFilter, statusFilter, editingUser, showInviteDialog, isSaving
- Form state: email, role, editHierarchyScopeId in respective sheets/dialogs

**Outputs:**
- User grid with cards showing avatar, name, email, roles, last login
- Sheets for role assignment and user invitations
- Dialogs for user details edit and confirm deactivate
- Toasts on success/failure

**Side effects:**
- onSuccess: invalidates member/role queries, shows toast, closes sheet
- Member status changes trigger hierarchy reassignment if applicable
- Email invitations are sent asynchronously (warnings if send fails but invitation created)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.members.list()` — fetch all members
- `client.roles.list()` — fetch all roles
- `client.hierarchy.listNodes()` — fetch hierarchy for scope selection
- `client.members.updateRole()` — update member role
- `client.members.deactivate()` — deactivate member
- `client.members.reactivate()` — reactivate member
- `client.invitations.create()` — create invitation
- `client.invitations.sendEmail()` — send invitation email
- `client.hierarchy.reassignMember()` — reassign member to new hierarchy scope

**Uses these components:**
- `MembersTabPage` @ `/components/pages/access-control/members-tab.tsx` — member management
- `InvitationsTabPage` @ `/components/pages/access-control/invitations-tab.tsx` — invitation management
- `ConsolidatedTabs` @ `/components/ui/consolidated-tabs` — tab UI
- `UserCard` — individual member card with actions

**Uses these hooks:**
- `useUserContext()` — access org ID, hierarchy scope
- `useQuery()` — fetch members, roles, hierarchy
- `useQueryClient()` — invalidate queries after mutations
- `useIsMobile()` — responsive sheet/dialog placement

**Navigation: who navigates here:**
- Access Control menu link or from roles page

**Navigation: where it goes:**
- Link to user-assignment from roles page quick-start guide

---

## 4. Data Shapes

**DB tables touched:**
- members — read, update (role, status, hierarchy scope)
- roles — read
- hierarchy_nodes — read
- invitations — create
- invitations_emails — create (via sendEmail)

**Key types / Zod schemas:**
- `UserForAssignment` — {id, name, firstName, lastName, email, roles[], isActive, lastLogin?, department?}
- `RoleResponse` — {id, name, description?, priority}
- `HierarchyNode` — {id, name, type, depth, parentId?, address?, picUserId?, createdAt, updatedAt}
- System roles: "admin" | "trainer" | "staff" | "client"

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** N/A

**Not tested (risk areas):**
- Bulk user operations (currently disabled in UI)
- Email send failure recovery (warning shown but no retry flow)
- Hierarchy scope reassignment validation (assumes valid scope provided)
- Concurrent member updates (no optimistic UI)
- Role priority-based sorting in dropdowns

---

## 6. Notes

- **No RBAC guard on route** — permission checks happen in component via `hasPermission("attendance_management:read")` pattern; consider adding explicit guard
- **Bulk actions UI present but disabled** — placeholder for future implementation
- **Hierarchy scope assignment** — optional in edit flow; only applied if editHierarchyScopeId is set
- **System roles are hardcoded** — not configurable (admin, trainer, staff, client)
- **Email send failures don't prevent invitation creation** — warning toasts allow graceful degradation
- **Last login timestamps** — calculated on client; no server-side relative time support
- **Member role mapping** — maps system role name to role.id for display/assignment

---

## Related Pages

- [Roles Management](/dashboard/access-control/roles)
