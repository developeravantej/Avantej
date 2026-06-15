# Test Plan: Appointment — Class Slots View

**Route:** `/dashboard/appointment/class-slots/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Permission required: `class_slot_management:read`
- Some services and class slots in the tenant DB

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/appointment/class-slots/view`
**Steps:**
1. Log in as admin, navigate
2. Wait for load
**Expected:**
- Page renders with class slots data table
- BranchSelector visible
- Plus/Create button visible
- Columns: Date, Time (start-end), Service, Capacity, Booked/Available, Status, Actions
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Steps:**
1. Navigate, observe immediately
**Expected:**
- PageLoader or loading indicator shown

### TC-03: Class slots table — populated
**Trigger:** Wait for data load
**Steps:**
1. Navigate and wait
**Expected:**
- DataTable rendered with class slot rows
- Each row shows: service name, branch, date, start/end time, capacity, spotsBooked, spotsAvailable, isCancelled badge

### TC-04: Empty state
**Trigger:** No class slots exist
**Steps:**
1. Navigate with no slots in DB
**Expected:**
- EmptyState component shown ("No class slots" or similar)

### TC-05: Branch selector — filter by branch
**Trigger:** Change selected branch
**Steps:**
1. Navigate, select a different branch from BranchSelector
**Expected:**
- Query re-fetches with new branchId
- Table updates to show only that branch's slots

### TC-06: Create class slot dialog — open
**Trigger:** Click Plus button
**Steps:**
1. Navigate to page
2. Click the create button (Plus icon)
**Expected:**
- Create dialog opens
- Form fields: serviceId, branchId, date, startTime, endTime, capacity, instructorId (optional), location (optional)

### TC-07: Create class slot — valid submission
**Trigger:** Fill form and submit
**Steps:**
1. Open create dialog
2. Select service, branch, date, start time, end time, capacity
3. Click submit
**Expected:**
- `client.classSlots.create` called
- Dialog closes on success
- Table refreshed with new slot

### TC-08: Create class slot — validation errors
**Trigger:** Submit empty form
**Steps:**
1. Open create dialog, click submit without filling required fields
**Expected:**
- Validation errors shown on required fields
- No API call

### TC-09: Edit class slot dialog — open
**Trigger:** Click edit action on a slot row
**Steps:**
1. Find a slot row
2. Click edit action
**Expected:**
- Edit dialog opens pre-filled with: startTime, endTime, capacity, instructorId, location

### TC-10: Edit class slot — valid submission
**Trigger:** Modify and save
**Steps:**
1. Change capacity
2. Click save
**Expected:**
- `client.classSlots.update` called
- Table refreshed

### TC-11: Cancel class slot
**Trigger:** Click cancel on active slot
**Steps:**
1. Find an active (non-cancelled) slot
2. Click cancel action
**Expected:**
- `client.classSlots.cancel` called
- `isCancelled` becomes true in table
- Status badge updates

### TC-12: Capacity checkbox behavior (create form)
**Trigger:** Toggle capacity options
**Steps:**
1. Open create dialog
2. Interact with capacity field
**Expected:**
- Checkbox or numeric input for capacity
- Minimum 1 capacity enforced

### TC-13: Permission guard
**Trigger:** Access without permission
**Steps:**
1. Log in without `class_slot_management:read`
2. Navigate to route
**Expected:**
- Redirect (if requirePermission enforces)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.classSlots.list({ organizationId, branchId })` | TC-03, TC-05 |
| `client.classSlots.create(...)` | TC-07 |
| `client.classSlots.update(...)` | TC-10 |
| `client.classSlots.cancel(id)` | TC-11 |

## Edge Cases

### EC-01: Overlapping class slots
**Setup:** Create slot at same time/branch as existing
**Expected:** API returns error; shown to user via toast

### EC-02: Past dates in create form
**Setup:** Enter past date
**Expected:** Form accepts it (no client-side date guard seen); server may reject

### EC-03: Capacity = 0
**Setup:** Enter 0 in capacity field
**Expected:** EMPTY_CREATE_FORM initializes to "1"; validation should prevent 0

## Known Gaps
- Exact API procedures for class slots unknown without reading service files
- Select controls for serviceId and instructorId not inspected (how they load options)
