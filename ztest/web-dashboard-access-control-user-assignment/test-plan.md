# Test Plan: Access Control — User Assignment (Staff Access)

**Route:** `/dashboard/access-control/user-assignment`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123 (admin role)
- Route delegates to `MembersTabPage` and `InvitationsTabPage` components

## Test Cases

### TC-01: Page loads — Members tab (default)
**Trigger:** Navigate to `/dashboard/access-control/user-assignment`
**Steps:**
1. Log in as admin, navigate to route
2. Wait for load
**Expected:**
- UserPlus icon + "Staff Access" heading + description visible
- "Members" and "Invitations" tab buttons visible
- "Members" tab active by default
- MembersTabPage content renders
- No console errors

### TC-02: Switch to Invitations tab
**Trigger:** Click "Invitations" tab
**Steps:**
1. Navigate to the route
2. Click "Invitations" tab
**Expected:**
- URL: `?tab=invitations`
- InvitationsTabPage renders
- "Invitations" tab visually active

### TC-03: Switch back to Members tab
**Trigger:** Click "Members" tab
**Steps:**
1. From invitations tab, click "Members"
**Expected:**
- URL: `?tab=members`
- MembersTabPage renders

### TC-04: Direct navigation to Invitations tab
**Trigger:** Navigate with `?tab=invitations`
**Steps:**
1. Navigate to `...?tab=invitations`
**Expected:**
- InvitationsTabPage rendered on load

### TC-05: Members tab — list members
**Trigger:** View MembersTabPage
**Steps:**
1. Navigate to route (Members tab)
2. Wait for load
**Expected:**
- Table/list of org members visible
- Each row shows name, role, status
- Actions: deactivate/reactivate, update role (per MEMORY.md)

### TC-06: Members tab — deactivate member
**Trigger:** Click deactivate on an active member
**Steps:**
1. Find an active member
2. Click deactivate action
**Expected:**
- Confirmation dialog (if any) shown
- `client.members.deactivate` called
- Member status updated to inactive in list

### TC-07: Members tab — reactivate member
**Trigger:** Click reactivate on inactive member
**Steps:**
1. Find inactive member
2. Click reactivate
**Expected:**
- Member status updated to active

### TC-08: Members tab — update role
**Trigger:** Change a member's role
**Steps:**
1. Find a member
2. Change role (admin/staff/etc.)
3. Confirm
**Expected:**
- `client.members.updateRole` called
- Role updated in table

### TC-09: Invitations tab — list invitations
**Trigger:** View InvitationsTabPage
**Steps:**
1. Navigate to `?tab=invitations`
2. Wait for load
**Expected:**
- Pending invitations listed
- Each row shows email, role, invited date, status

### TC-10: Invitations tab — create new invitation
**Trigger:** Click invite button
**Steps:**
1. Navigate to Invitations tab
2. Click invite/send invitation button
3. Fill email and role
4. Submit
**Expected:**
- `client.invitations.invite` called
- New invitation appears in list

### TC-11: Invitations tab — resend invitation
**Trigger:** Resend a pending invitation
**Steps:**
1. Find pending invitation
2. Click resend action
**Expected:**
- Resend mutation called
- Toast confirmation

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.members.list` (in MembersTabPage) | TC-05 |
| `client.members.deactivate` | TC-06 |
| `client.members.reactivate` | TC-07 |
| `client.members.updateRole` | TC-08 |
| `client.invitations.list` | TC-09 |
| `client.invitations.invite` | TC-10 |
| `client.invitations.resend` (if exists) | TC-11 |

## Edge Cases

### EC-01: Unknown tab param
**Setup:** Navigate to `?tab=unknown`
**Expected:** Defaults to "members" tab

### EC-02: Empty members list
**Setup:** Org with only one member (current user)
**Expected:** Table shows current user; deactivate not available for own account

### EC-03: Empty invitations list
**Setup:** No pending invitations
**Expected:** Empty state shown

### EC-04: Deactivate self
**Setup:** Try to deactivate own account
**Expected:** Action prevented or error shown

## Known Gaps
- MembersTabPage and InvitationsTabPage components not read in detail
- Exact invite form fields, role options unknown
- MEMORY.md confirms these actions exist; specific UI flows need verification
