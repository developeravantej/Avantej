# Test Plan: Attendance View

**Route:** `/dashboard/attendance/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Permissions: `attendance_management:read` (for viewing), `attendance_management:delete` (for deleting check-ins)
- Some check-in and booking data in DB
- Accessible branches available in userContext

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/attendance/view`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- 4 KPI cards: booked, checked-in, no-shows, cancelled (icons: ClipboardCheck, Clock, UserCheck, XCircle)
- StatusCallout (if any info message)
- BranchSelector or branch drop-down
- Date picker (default: today's date in local time)
- TodayBookingsSection visible
- CheckInsLog visible
- DropInForm visible
- No console errors

### TC-02: Branch selector — select branch
**Trigger:** Change branch selection
**Steps:**
1. Navigate to route
2. Select a different branch from the branch drop-down
**Expected:**
- `branchId` state updates
- Queries re-fetch with new branchId
- KPI cards and booking/check-in lists update

### TC-03: Date picker — change date
**Trigger:** Change date in date input
**Steps:**
1. Navigate to route
2. Change the date field to yesterday
**Expected:**
- `date` state updates to selected YYYY-MM-DD
- TodayBookingsSection re-fetches for that date
- CheckInsLog re-fetches for that date

### TC-04: KPI cards — populated
**Trigger:** Wait for data
**Steps:**
1. Navigate, wait
**Expected:**
- KPI cards show numeric values
- Each KPI card shows: icon in rounded bg, number, label

### TC-05: TodayBookingsSection — populated
**Trigger:** With bookings on selected date
**Steps:**
1. Navigate to route with date that has bookings
**Expected:**
- Bookings table/list renders
- Each row shows customer, service, trainer, status

### TC-06: TodayBookingsSection — empty
**Trigger:** Date with no bookings
**Steps:**
1. Change date to a date with no bookings
**Expected:**
- Empty state shown in TodayBookingsSection

### TC-07: CheckInsLog — populated
**Trigger:** With check-ins on selected date
**Steps:**
1. Navigate with check-ins in DB
**Expected:**
- CheckInsLog shows list of check-ins
- Each row shows member name, check-in time, check-in type

### TC-08: CheckInsLog — delete check-in (with permission)
**Trigger:** Admin deletes a check-in
**Steps:**
1. Log in as admin with `attendance_management:delete`
2. Navigate to route
3. Click delete on a check-in row
**Expected:**
- Delete action visible on each row
- Mutation fires
- Check-in removed from list after success

### TC-09: CheckInsLog — no delete action without permission
**Trigger:** Staff without delete permission
**Steps:**
1. Log in as user without `attendance_management:delete`
2. Navigate to route
**Expected:**
- Delete action NOT visible on check-in rows

### TC-10: DropInForm — submit check-in
**Trigger:** Use drop-in form
**Steps:**
1. Navigate to route
2. Fill drop-in form fields (member, service, etc.)
3. Submit
**Expected:**
- Check-in created via mutation
- CheckInsLog re-fetches and shows new entry

### TC-11: RBAC — no read permission
**Trigger:** Access without attendance_management:read
**Steps:**
1. Log in without the permission
**Expected:**
- `hasPermission("attendance_management:read")` = false
- Appropriate "no access" state shown (no hard redirect since beforeLoad uses hasPermission in component)

### TC-12: No organization context
**Trigger:** User has no active org
**Steps:**
1. Simulate null organizationId
**Expected:**
- Queries disabled (enabled: !!organizationId)
- Empty/loading state; no crash

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.attendance.getStats({ organizationId, branchId, date })` (or similar) | TC-04 |
| `client.attendance.listBookings({ organizationId, branchId, date })` | TC-05, TC-06 |
| `client.attendance.listCheckIns({ organizationId, branchId, date })` | TC-07 |
| `client.attendance.deleteCheckIn(id)` | TC-08 |
| `client.attendance.createCheckIn(...)` (DropInForm) | TC-10 |
| `useUserContext()` | TC-01 |

## Edge Cases

### EC-01: branchOptions empty (no accessible branches)
**Setup:** User with no accessible branch-type nodes
**Expected:** Falls back to all accessible nodes; if none, branchId defaults to "" and queries may return empty

### EC-02: Local date formatting edge cases
**Setup:** Midnight UTC crossover
**Expected:** `toLocalDateString(new Date())` uses local time; correct date for user's timezone

### EC-03: Large number of check-ins
**Setup:** 500+ check-ins on a day
**Expected:** CheckInsLog handles large list without crash

## Known Gaps
- Exact API procedure names for attendance unknown without reading server routers
- DropInForm fields not inspected
- KPI card exact query unknown
