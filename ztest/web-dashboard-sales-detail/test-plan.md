# Test Plan: Sales Order Detail

**Route:** `/dashboard/sales/$id`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- A valid sales order ID in tenant DB
- Permission for refunds: `refund_management:create`

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/sales/<valid_id>`
**Steps:**
1. Log in, navigate to a valid order ID
2. Wait for load
**Expected:**
- "Back to Sales" link (ArrowLeft) → `/dashboard/sales/view`
- Order summary: number, status badge, customer, items, totals
- StatusCallout for order status
- Invoices section (if any)
- Print button (Printer icon)
- Refund buttons (if permitted)
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Expected:**
- PageLoader shown while `orderLoading`

### TC-03: Error state — order not found
**Trigger:** Navigate with invalid order ID
**Steps:**
1. Navigate to `/dashboard/sales/00000000-0000-0000-0000-000000000000`
**Expected:**
- Error state shown
- Back button visible to return to sales list

### TC-04: Status badge display
**Trigger:** View order with various statuses
**Expected:**
- `SalesStatusBadge` maps statuses correctly:
  - "completed" → completed badge
  - "processing" → "Processing" label with pending style
  - "partially_paid" → "Partially Paid" label
  - "overdue" → "Overdue" label with rejected style

### TC-05: Print receipt — open dialog
**Trigger:** Click Printer button
**Steps:**
1. Click the print button
**Expected:**
- `setPrintDialogOpen(true)`
- `client.pos.getReceiptData({ organizationId, salesOrderId })` called (enabled when dialog open)
- Dialog opens with ReceiptView component

### TC-06: Print dialog — receipt renders
**Trigger:** After receipt data loads
**Expected:**
- ReceiptView shows: org name, order items, totals, payment details
- Print action available

### TC-07: Request refund — open dialog (with permission)
**Trigger:** Click refund button
**Steps:**
1. Log in with `refund_management:create`
2. Navigate to completed/paid order
3. Click refund button
**Expected:**
- RequestRefundDialog opens
- Fields: reason, amount, notes
- Submit fires `client.refunds.create` or similar

### TC-08: Partial refund dialog
**Trigger:** Click partial refund
**Steps:**
1. Click partial refund button
**Expected:**
- PartialRefundDialog opens
- Partial amount selection visible

### TC-09: Refund not available without permission
**Trigger:** View as user without refund_management:create
**Expected:**
- Refund buttons not visible
- `hasPermission("refund_management:create")` = false

### TC-10: Invoices list
**Trigger:** View order with invoices
**Steps:**
1. Navigate to order that has invoices
**Expected:**
- Invoices list/section visible
- Each invoice shows: invoice number, amount, payment mode, date

### TC-11: Back navigation
**Trigger:** Click back arrow
**Expected:**
- Navigate to `/dashboard/sales/view`

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.salesOrders.getById({ organizationId, id })` | TC-01, TC-03 |
| `client.invoices.list({ organizationId, salesOrderId })` | TC-10 |
| `client.pos.getReceiptData({ organizationId, salesOrderId })` | TC-05 (enabled on dialog open) |
| `client.refunds.create(...)` | TC-07 |

## Edge Cases

### EC-01: Receipt data load failure
**Setup:** `pos.getReceiptData` fails
**Expected:** Print dialog still opens; receipt shows error or empty state

### EC-02: Order with 0 invoices
**Setup:** Order not yet invoiced
**Expected:** Invoices section shows empty or not shown

### EC-03: Unknown status
**Setup:** Order with status not in STATUS_MAP
**Expected:** Falls back to "draft" style with status text as label

## Known Gaps
- ReceiptView, RequestRefundDialog, PartialRefundDialog components not inspected
- Exact refund creation API procedure unknown
