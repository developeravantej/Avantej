# Test Plan: Branch Create

**Route:** `/dashboard/branch/create`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as admin user
- Permission required: `hierarchy_management:create`
- Route delegates to `HierarchicalBranchForm` component

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/branch/create`
**Steps:**
1. Log in as admin, navigate to route
2. Wait for load
**Expected:**
- "Create Branch" heading
- HierarchicalBranchForm rendered (left 2/3)
- "How it works" info card on right (sticky)
- Info card shows 4 steps: Country, Region, Area, Branch
- No console errors

### TC-02: How it works card
**Trigger:** Check info card content
**Expected:**
- Steps 1-4 with numbered circles
- Country, Region, Area, Branch labels and descriptions

### TC-03: Hierarchical form — Country step
**Trigger:** Interact with first step
**Steps:**
1. Navigate to route
2. Observe first step in form
**Expected:**
- Country selection (select or create)
- Form progresses step by step

### TC-04: Hierarchical form — full flow to Branch creation
**Trigger:** Complete all 4 hierarchy levels
**Steps:**
1. Navigate to route
2. Select/create Country
3. Select/create Region
4. Select/create Area
5. Enter Branch name and details
6. Submit
**Expected:**
- Each step unlocks next
- On success: `onSuccess` callback fires
- Branch created in hierarchy
- Possible redirect or success message

### TC-05: Permission guard
**Trigger:** Access without hierarchy_management:create
**Steps:**
1. Log in without the permission
2. Navigate to route
**Expected:**
- `requirePermission()` in `beforeLoad` redirects to `/dashboard/branch/view`

### TC-06: Validation — required fields empty
**Trigger:** Try to progress/submit without required data
**Expected:**
- Validation errors on required fields at each step

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.hierarchy.createNode(...)` (in HierarchicalBranchForm) | TC-04 |
| `client.hierarchy.listNodes(...)` (for dropdowns) | TC-03 |

## Edge Cases

### EC-01: Duplicate branch name
**Setup:** Create branch with same name as existing
**Expected:** API error shown; form stays open

### EC-02: onSuccess handler is empty
**Setup:** Code shows `handleSuccess` is a no-op `() => {}`
**Expected:** After successful creation, no redirect occurs (TODO in code); stays on page

## Known Gaps
- HierarchicalBranchForm component not read in detail
- Exact API calls and validation rules unknown
- onSuccess is currently a no-op (TODO comment in code)
