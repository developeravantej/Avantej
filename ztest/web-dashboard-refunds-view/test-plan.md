# Test Plan: Refunds View

**Route:** `/dashboard/refunds/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Some refund records in tenant DB (pending, approved, rejected, processed)

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/refunds/view`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- Undo2 icon + "Refunds" heading (or similar)
- Status tabs: All, Pending, Approved, Rejected, Processed
- "All" tab active by default
- DataTable with refund rows
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Expected:**
- PageLoader shown

### TC-03: Refunds table — populated
**Trigger:** Wait for data
**Expected:**
- Rows show: refund number, customer name, status badge, amount, reason, requested by, requested date
- CopyableCell for order/refund IDs

### TC-04: Status tab filter — Pending
**Trigger:** Click "Pending" tab
**Steps:**
1. Click Pending tab
**Expected:**
- Only pending refunds shown
- Tab visually active

### TC-05: Status tab filter — Approved
**Trigger:** Click "Approved"
**Expected:**
- Only approved refunds shown

### TC-06: Status tab filter — Rejected
**Trigger:** Click "Rejected"
**Expected:**
- Only rejected refunds

### TC-07: Status tab filter — Processed
**Trigger:** Click "Processed"
**Expected:**
- Only processed refunds

### TC-08: Status tab filter — All
**Trigger:** Click "All"
**Expected:**
- All refunds regardless of status

### TC-09: Approve refund
**Trigger:** Click approve on pending refund
**Steps:**
1. Find a pending refund
2. Click "Approve" action
3. (Confirm if dialog shown)
**Expected:**
- `client.refunds.approve(id)` called
- Refund status updates to "approved"
- Toast shown

### TC-10: Reject refund — dialog with notes
**Trigger:** Click reject on pending refund
**Steps:**
1. Find a pending refund
2. Click "Reject" action
3. Dialog opens with rejection notes textarea
4. Enter reason, confirm
**Expected:**
- Dialog opens with Textarea for review notes
- `client.refunds.reject(id, { notes })` called
- Refund status updates to "rejected"

### TC-11: Process refund dialog
**Trigger:** Click process on approved refund
**Steps:**
1. Find an approved refund
2. Click "Process" action
**Expected:**
- ProcessRefundDialog opens
- Fields: refund method, refund reference
- Submit fires `client.refunds.process(id, { method, reference })`

### TC-12: Empty state per tab
**Trigger:** Tab with no refunds
**Expected:**
- EmptyState shown for that status
- StatusCallout may show additional context

### TC-13: Status callout — contextual info
**Trigger:** View refund with special state
**Expected:**
- StatusCallout renders relevant info (e.g., processed refund details)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.refunds.list({ organizationId, status? })` | TC-03, TC-04—TC-08 |
| `client.refunds.approve(id)` | TC-09 |
| `client.refunds.reject(id, { notes })` | TC-10 |
| `client.refunds.process(id, { refundMethod, refundReference })` | TC-11 |

## Edge Cases

### EC-01: Double-click approve/reject
**Setup:** Click action twice quickly
**Expected:** Mutation is loading on first click; button disabled prevents second call

### EC-02: Refund with null salesOrderNumber
**Setup:** Refund not linked to an order
**Expected:** salesOrderNumber column shows "—"

### EC-03: Very old refund (formatted date)
**Setup:** Refund from 2020
**Expected:** Date formatted correctly; no "Invalid Date"

## Known Gaps
- ProcessRefundDialog component not inspected
- Exact reject dialog textarea and button layout not confirmed
- Permission guards for approve/reject/process not inspected
