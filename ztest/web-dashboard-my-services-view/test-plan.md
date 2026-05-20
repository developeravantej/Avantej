# Test Plan: My Services View

**Route:** `/dashboard/my-services/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123 (staff/trainer with assigned services)
- Some services assigned to the current member via `serviceMembers`

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/my-services/view`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- Briefcase icon + "My Services" heading (or similar)
- DataTable of assigned services
- Each row: service name, category, default buffer, current buffer time
- Edit button per row
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Steps:**
1. Navigate, observe immediately
**Expected:**
- PageLoader visible

### TC-03: Service list — populated
**Trigger:** With assigned services
**Steps:**
1. Navigate, wait for load
**Expected:**
- Table rows show: service name, category name, `categoryDefaultBuffer`, `bufferTimeMinutes`
- Edit icon button on each row

### TC-04: Empty state — no assigned services
**Trigger:** Member has no service assignments
**Steps:**
1. Log in as member with no services
2. Navigate to route
**Expected:**
- EmptyState component shown

### TC-05: Edit buffer — open dialog
**Trigger:** Click edit on a service row
**Steps:**
1. Click Edit icon on a service
**Expected:**
- `Dialog` (not Sheet) opens with title "Set Buffer Time"
- Read-only: service name displayed
- Read-only: category name displayed (if present)
- Number input pre-filled with current `bufferTimeMinutes` (or empty if null)
- Placeholder: "Leave blank to use category default"
- Category default buffer shown as hint
- Save, Cancel buttons; "Clear Override" button only if current override exists

### TC-06: Edit buffer — valid submission
**Trigger:** Change buffer time and save
**Steps:**
1. Open edit dialog
2. Change buffer to "15"
3. Click Save
**Expected:**
- `client.serviceMembers.updateMyBuffer({ organizationId, serviceId, bufferTimeMinutes: 15 })` called
- Success toast: "Buffer time updated."
- Dialog closes
- Table row updated with new buffer value
- Query invalidated and refetched

### TC-07: Edit buffer — clear buffer (null)
**Trigger:** Clear buffer input and save
**Steps:**
1. Open edit dialog
2. Clear the input
3. Click Save
**Expected:**
- `bufferTimeMinutes: null` passed to mutation
- Buffer value removed (uses category default)

### TC-08: Edit buffer — cancel
**Trigger:** Click Cancel in edit dialog
**Steps:**
1. Open dialog
2. Click Cancel
**Expected:**
- Dialog closes
- No mutation fired
- Table unchanged

### TC-09: Edit buffer — error handling
**Trigger:** Mutation fails
**Steps:**
1. Simulate API error
**Expected:**
- Error toast with actual error message or "Failed to update."

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.serviceMembers.listMine({ organizationId })` | TC-03, TC-04 |
| `client.serviceMembers.updateMyBuffer({ organizationId, serviceId, bufferTimeMinutes })` | TC-06, TC-07 |

## Edge Cases

### EC-01: bufferTimeMinutes = 0
**Setup:** Enter "0" in buffer input
**Expected:** Either accepted (0 min buffer) or treated as null; not crash

### EC-02: Non-numeric input in buffer field
**Setup:** Type "abc" in buffer input
**Expected:** Validation prevents non-numeric; or parsed as NaN and coerced to null

### EC-03: Category with no default buffer
**Setup:** Service's category has `categoryDefaultBuffer = 0` or null
**Expected:** Display handles null/0 gracefully

### EC-04: Clear Override button
**Setup:** Open edit dialog for service with an existing override
**Expected:** "Clear Override" button visible; clicking calls `updateMyBuffer({ bufferTimeMinutes: null })`

## Known Gaps
- Non-numeric input (NaN parse) behavior: component calls `toast.error("Please enter a valid number")` rather than silently nulling
