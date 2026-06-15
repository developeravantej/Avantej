# Test Plan: Payment View (Invoices)

**Route:** `/dashboard/payment/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Some invoices in tenant DB

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/payment/view`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- CreditCard icon + "Payments" heading + "View and manage invoice payments." description
- Separator
- Rounded table container
- PaymentDataTable with invoice data
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Expected:**
- Loading indicator in table area (isLoading state)

### TC-03: Payment table — populated
**Trigger:** Wait for invoice data
**Expected:**
- Rows show: date, invoice number, sales order ID, payment mode, total paid, customer name, created by, e-invoice status

### TC-04: Empty state
**Trigger:** No invoices exist
**Expected:**
- Empty state shown in table

### TC-05: Error state
**Trigger:** API failure
**Expected:**
- Error state or message visible
- Retry mechanism

### TC-06: Payment table columns
**Trigger:** Inspect rendered columns
**Expected:**
- date: formatted date
- invoice: invoice number
- sales_order: sales order ID (linked?)
- mode: payment mode (cash, card, etc.)
- total_paid: formatted amount
- customer_name
- created_by
- e_invoice_status: status badge

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.invoices.list({ organizationId })` | TC-03, TC-04 |

## Edge Cases

### EC-01: Invoice with null date
**Setup:** Invoice without date field
**Expected:** `item.date ? item.date.toISOString() : null` — null shown in table as "—"

### EC-02: Invoice with null payment mode
**Setup:** Invoice with mode not set
**Expected:** mode shows null/empty in PaymentRow

### EC-03: e-invoice status values
**Setup:** Invoices with different e-invoice states
**Expected:** PaymentDataTable renders appropriate badge for each status

## Known Gaps
- PaymentDataTable columns and behavior not fully inspected
- e_invoice_status possible values unknown
- Navigation from invoice row (if any) not confirmed
