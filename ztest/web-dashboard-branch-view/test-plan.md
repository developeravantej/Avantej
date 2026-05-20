# Test Plan: Branch View

**Route:** `/dashboard/branch/$id` (actual file: branch/view.tsx)
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Some hierarchy nodes in tenant DB
- Route file is branch/view.tsx (note: listed as $id but actual file is view.tsx at same path level)

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/branch/view`
**Steps:**
1. Log in, navigate to `/dashboard/branch/view`
2. Wait for load
**Expected:**
- Branch hierarchy table rendered
- DataTable with branch columns
- Store icon + heading visible
- "Add Branch" or Plus button visible (for admins)
- No console errors

### TC-02: Loading state — auth loading
**Trigger:** Observe during auth check
**Expected:**
- Page shows loading state while `authLoading` or `isLoadingContext`

### TC-03: Branch table — populated
**Trigger:** Wait for hierarchy data
**Expected:**
- Rows show: branch name, type, depth, parent, code
- Each row has actions

### TC-04: Branch table — empty state
**Trigger:** No hierarchy nodes
**Expected:**
- EmptyState shown

### TC-05: Edit branch dialog — open
**Trigger:** Click edit on a branch row
**Steps:**
1. Find a branch row
2. Click edit action
**Expected:**
- Edit dialog opens with branch name and type fields pre-filled

### TC-06: Edit branch — valid submission
**Trigger:** Change branch name and save
**Steps:**
1. Open edit dialog
2. Change name
3. Submit
**Expected:**
- Mutation fires (client.hierarchy.updateNode or similar)
- Success toast
- Table refreshed

### TC-07: Create from view — Plus button
**Trigger:** Click Plus button (if visible)
**Steps:**
1. Navigate to route
2. Click Plus button
**Expected:**
- Either opens create dialog or navigates to `/dashboard/branch/create`

### TC-08: Member reassignment
**Trigger:** MemberReassignment component interaction
**Steps:**
1. Find MemberReassignment in page
2. Select member, assign to different branch
**Expected:**
- `MemberReassignment` component renders
- Member assigned to new node
- Toast confirmation

### TC-09: Member selector
**Trigger:** MemberSelector component interaction
**Expected:**
- Dropdown/search to select a member for assignment

### TC-10: Organization context error
**Trigger:** `userContextError` is set
**Steps:**
1. Simulate context load failure
**Expected:**
- `orgErrorShown` ref prevents duplicate toasts
- Error toast shown once

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.hierarchy.listNodes({ organizationId })` | TC-03 |
| `client.hierarchy.updateNode(...)` | TC-06 |
| `client.hierarchy.assignMember(...)` (MemberReassignment) | TC-08 |

## Edge Cases

### EC-01: Not authenticated on load
**Setup:** `isAuthenticated` is false
**Expected:** Navigate to login (useAuth handles redirect)

### EC-02: Deep hierarchy (5+ levels)
**Setup:** Many hierarchy levels
**Expected:** Table shows all levels; depth indicated in rows

## Known Gaps
- Branch $id route file is missing (only view.tsx and create.tsx exist in branch/)
- Exact edit dialog fields and validation not read from component
- MemberReassignment and MemberSelector components not inspected
