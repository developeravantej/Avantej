# Test Plan: Appointment View

**Route:** `/dashboard/appointment/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Permission required: `appointment_management:read`
- Some appointments in the tenant DB

## Test Cases

### TC-01: Page loads — admin user sees trainer sidebar
**Trigger:** Navigate to `/dashboard/appointment/view` as admin
**Steps:**
1. Log in as admin user
2. Navigate to the route
3. Wait for load
**Expected:**
- TrainerSidebar visible (width 60 on left)
- AppointmentList visible (flex-1 on right)
- No console errors

### TC-02: Page loads — staff user has no trainer sidebar
**Trigger:** Navigate as staff user
**Steps:**
1. Log in as staff user
2. Navigate to the route
**Expected:**
- No TrainerSidebar shown (canViewAllTrainers = false)
- Only AppointmentList visible
- Staff sees only their own appointments (selectedTrainerId = memberId)

### TC-03: Appointments list — loading state
**Trigger:** Observe before data arrives
**Steps:**
1. Navigate to route
2. Observe AppointmentList before response
**Expected:**
- `isLoading` prop passed to AppointmentList; loading indicator shown

### TC-04: Appointments list — populated state
**Trigger:** Wait for data load
**Steps:**
1. Navigate to route, wait for appointments
**Expected:**
- List of appointments shown
- Each appointment shows trainer, time, customer, status

### TC-05: Appointments list — empty state
**Trigger:** No appointments in date range
**Steps:**
1. Navigate to route with no appointments in query range
**Expected:**
- Empty state UI in AppointmentList (not crash/blank)

### TC-06: Appointments list — error state
**Trigger:** API error
**Steps:**
1. Simulate API failure
**Expected:**
- Error message: actual error message or "Failed to load appointments" displayed
- Not a blank page

### TC-07: Trainer sidebar — filter by trainer
**Trigger:** Select a trainer in sidebar (admin)
**Steps:**
1. As admin, navigate to route
2. Click on a specific trainer in TrainerSidebar
**Expected:**
- `sidebarSelectedId` updates
- `client.appointments.list` re-fetches with `trainerId = selectedTrainerId`
- Appointment list updates to show only selected trainer's appointments

### TC-08: Trainer sidebar — deselect (show all)
**Trigger:** Click "all trainers" or deselect in sidebar
**Steps:**
1. Select a trainer, then click to deselect
**Expected:**
- `sidebarSelectedId` = null
- All trainers' appointments shown

### TC-09: No organization — early return
**Trigger:** User has no org in context
**Steps:**
1. Simulate `organizationId = null`
**Expected:**
- "No organization selected." text shown
- No API call made

### TC-10: Permission guard check
**Trigger:** Access without permission
**Steps:**
1. Log in as user without `appointment_management:read`
2. Navigate to route
**Expected:**
- `requirePermission()` in `beforeLoad` — redirects to `/dashboard` (stub may not enforce)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.appointments.list({ organizationId, trainerId, startFrom, startTo, limit })` | TC-04, TC-07, TC-08 |

## Edge Cases

### EC-01: Date range boundary
**Setup:** Query range spans midnight or month boundary
**Expected:** `getAppointmentQueryRange()` returns valid ISO dates; API handles range correctly

### EC-02: 200+ appointments (limit: 200)
**Setup:** Large dataset
**Expected:** List renders all 200 without crash; no pagination shown (hardcoded limit)

### EC-03: `mapApiAppointmentToCalendar` mapping
**Setup:** Appointment with null fields (trainer, customer name)
**Expected:** Calendar mapping handles nulls; no crash in useMemo

## Known Gaps
- AppointmentList component not read; exact UI elements unknown
- TrainerSidebar behavior not inspected
- `getAppointmentQueryRange()` logic unknown; exact date window not verified
