# Test Plan: Operations — Package Approvals

**Route:** `/dashboard/operations/approvals`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123 (admin or trainer)
- `package_approval.required` org setting must be enabled
- Some pending package instances (status = "pending") in tenant DB
- Routes uses: `AssignTrainerDrawer`, `RejectPackageDialog`

## Test Cases

### TC-01: Page loads — happy path (admin with pending approvals)
**Trigger:** Navigate to `/dashboard/operations/approvals` as admin
**Steps:**
1. Log in as admin
2. Navigate to route
3. Wait for load
**Expected:**
- CheckCircle2 icon + "Package Approvals" (or similar) heading
- Pending packages table with columns: customer, service, branch, total price, credits, created date, preferred trainer
- Assign and Reject actions per row
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Expected:**
- PageLoader shown while fetching

### TC-03: Pending packages table — populated
**Trigger:** Wait for data
**Expected:**
- Table rows: customerName, customerEmail, serviceName, branchId, totalPrice, creditsTotal, createdAt
- Preferred trainer shown (name or "None")
- "Assign" and "Reject" buttons per row

### TC-04: Empty state — no pending packages
**Trigger:** All packages assigned/rejected
**Steps:**
1. Navigate with no pending packages
**Expected:**
- EmptyState component: "No pending approvals" (Inbox icon)
- Positive message shown

### TC-05: Assign trainer — open drawer (admin)
**Trigger:** Admin clicks "Assign" on a package row
**Steps:**
1. Log in as admin
2. Click "Assign" button on a pending row
**Expected:**
- `AssignTrainerDrawer` opens
- Trainer list for the package's branch shown
- Preferred trainer highlighted if set

### TC-06: Assign trainer — select and confirm
**Trigger:** Select trainer and confirm in drawer
**Steps:**
1. Select a trainer from the list
2. Click confirm/assign
**Expected:**
- `client.packageInstances.assign({ id, trainerId, organizationId })` called
- Package removed from pending list
- Toast: "Trainer assigned" or similar
- Audit log entry created

### TC-07: Trainer self-assign (trainer role)
**Trigger:** Trainer clicks "Assign" on package where they are the preferred trainer
**Steps:**
1. Log in as trainer
2. Navigate to approvals
3. Click Assign on package where preferred trainer = self
**Expected:**
- Drawer shows self-assignment option
- Assign confirms with trainer's own ID

### TC-08: Reject package — open dialog
**Trigger:** Click "Reject" on a pending row
**Steps:**
1. Click Reject button
**Expected:**
- `RejectPackageDialog` opens
- Rejection reason textarea
- Confirm/Cancel buttons

### TC-09: Reject package — valid submission
**Trigger:** Enter reason and confirm
**Steps:**
1. Open reject dialog
2. Enter reason: "Service not available at requested time"
3. Click confirm
**Expected:**
- `client.packageInstances.reject({ id, reason, organizationId })` called
- Package removed from pending list
- Toast: rejection success
- Customer notification sent (per MEMORY.md package approval flow)

### TC-10: Reject without reason
**Trigger:** Submit empty rejection dialog
**Expected:**
- Validation error: reason required, or API rejects with error

### TC-11: Role-based visibility — admin sees all packages
**Trigger:** Admin navigates
**Expected:**
- Scope="all"; all pending packages shown
- "Assign Trainer" button (opens drawer with trainer picker, lockTrainer=false)
- "Reject" button visible per row

### TC-12: Role-based visibility — trainer sees limited packages
**Trigger:** Trainer navigates
**Expected:**
- Scope="assignable_to_me"; packages where trainer can self-assign
- Only "Assign me" button per row (no Reject button)
- "Assign me" disabled if callerMemberId is null
- AssignTrainerDrawer opens with lockTrainer=true (self-assign only)

### TC-13: Non-admin non-trainer role — access denied
**Trigger:** Navigate as staff member (not admin or trainer)
**Steps:**
1. Log in as staff member with callerRole !== "admin" AND !== "trainer"
2. Navigate to route
**Expected:**
- StatusCallout with variant="error" shown
- Message: "You don't have permission to view approvals."
- No table rendered

### TC-14: Refresh button
**Trigger:** Click Refresh button
**Steps:**
1. Navigate to route
2. Click "Refresh" button (outline, sm)
**Expected:**
- `refetch()` called
- Loading state shown
- Table re-fetches pending packages

### TC-15: Error state — API failure
**Trigger:** Simulate fetch error
**Expected:**
- `isError` = true
- StatusCallout with variant="error": "Failed to load pending packages."
- Table not shown; empty state not shown

### TC-16: Preferred trainer badge
**Trigger:** View row with preferred trainer
**Steps:**
1. Package purchased with a preferred trainer set
**Expected:**
- Badge with "Preferred: <trainer name>" shown next to customer name

### TC-17: Assign then refetch
**Trigger:** Assign a trainer, verify table refreshes
**Steps:**
1. Click "Assign Trainer" on a row
2. Select trainer in drawer, confirm
3. `onAssigned` callback triggers `refetch()`
**Expected:**
- Assigned package disappears from the list
- Remaining pending packages still shown

### TC-18: Reject then refetch
**Trigger:** Reject a package, verify table refreshes
**Steps:**
1. Click "Reject" on a row, fill reason, confirm
2. `onRejected` callback triggers `refetch()`
**Expected:**
- Rejected package disappears from the list
- StatusCallout shows context about package approval flow

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.packageInstances.listPending({ organizationId })` | TC-03, TC-04 |
| `client.packageInstances.assign({ id, trainerId, organizationId })` | TC-06, TC-07 |
| `client.packageInstances.reject({ id, reason, organizationId })` | TC-09 |
| `useUserContext()` (for role checking) | TC-11, TC-12 |

## Edge Cases

### EC-01: Package with no preferred trainer
**Setup:** Customer didn't select preferred trainer at purchase
**Expected:** Preferred trainer shown as "—" or "None"; all branch trainers available in drawer

### EC-02: Preferred trainer no longer in branch
**Setup:** Preferred trainer reassigned since purchase
**Expected:** Drawer shows available trainers; preferred trainer not in list; handled gracefully

### EC-03: Date formatting with invalid date
**Setup:** `createdAt` null or malformed
**Expected:** `formatDate()` returns "—"; no crash

### EC-04: Package approval setting disabled
**Setup:** Org with `package_approval.required = false`
**Expected:** No pending packages ever appear; empty state or redirect

## Known Gaps
- AssignTrainerDrawer and RejectPackageDialog components not inspected in detail
- useMemo usage in page (filtering by accessible branch IDs) not confirmed
- Customer notification behavior on reject confirmed by feature docs (Phase 5)
