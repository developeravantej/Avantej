# Test Plan: Payouts View

**Route:** `/dashboard/payouts/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Some payout records in tenant DB

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/payouts/view`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- Banknote icon + "Payouts" heading (or similar)
- Status tabs: All, Pending, Processing, Paid, Failed, Canceled
- DataTable with payout rows
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Expected:**
- PageLoader shown

### TC-03: Payouts table — populated
**Trigger:** Wait for data
**Expected:**
- Rows show: recipient name, amount, status, paidAt date, appointmentId, batchId
- Formatted amounts in MYR

### TC-03b: KPI strip
**Trigger:** Wait for data (any filter)
**Expected:**
- 4 KPI tiles: Pending (count + total MYR), Processing (count), Paid (total MYR + count), Failed (count + "requires attention" if > 0)
- Failed tile has amber highlight when failedRows.length > 0

### TC-04: Status filter — Pending
**Trigger:** Click "Pending" tab
**Expected:**
- Only `status: "pending"` payouts shown
- Query re-fetches with statusFilter

### TC-05: Status filter — Paid
**Trigger:** Click "Paid" tab
**Expected:**
- Only paid payouts shown

### TC-06: Status filter — Failed
**Trigger:** Click "Failed" tab
**Expected:**
- Failed payouts shown

### TC-07: Status filter — All
**Trigger:** Click "All" tab (statusFilter = undefined)
**Expected:**
- All payouts shown regardless of status

### TC-08: Empty state per filter
**Trigger:** Filter with no matching payouts
**Expected:**
- EmptyState shown

### TC-09: Error state
**Trigger:** API failure
**Expected:**
- StatusCallout shown with error info
- Retry available

### TC-10: No organization
**Trigger:** `organizationId` is null
**Expected:**
- Query disabled; empty/loading state

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.payouts.list({ organizationId, status? })` | TC-03, TC-04, TC-05, TC-06, TC-07 |

## Edge Cases

### EC-01: Payout with null batchId
**Setup:** Individual payout (not batched)
**Expected:** batchId column shows "—" or empty

### EC-02: Payout with null paidAt
**Setup:** Pending/processing payout
**Expected:** paidAt shows "—" not "Invalid Date"

### EC-03: Large payout amount
**Setup:** Payout over 10,000 MYR
**Expected:** `formatPrice` handles large numbers correctly

## Known Gaps
- Payout column definitions not inspected in detail
- Admin-only actions (e.g., mark as paid, batch processing) not covered
