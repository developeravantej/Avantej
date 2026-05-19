# Test Plan: Sales View

**Route:** `/dashboard/sales/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Some sales orders and invoices in tenant DB

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/dashboard/sales/view`
**Steps:**
1. Log in, navigate to route
2. Wait for load
**Expected:**
- Tabs: Sales and Payments (Tabs component)
- "Sales" tab active by default
- "New Sale" button (Plus icon) in header
- FilterToolbar for sales visible
- SalesDataTable rendered
- No console errors

### TC-02: Loading state
**Trigger:** Observe before data
**Expected:**
- PageLoader during initial load

### TC-03: Sales tab — populated
**Trigger:** Wait for sales data
**Expected:**
- Sales rows with: order number, customer, date, status badge, total revenue
- Total revenue and stats visible (CheckCircle2 completed count, XCircle cancelled count, TrendingUp total)

### TC-04: Sales tab — empty state
**Trigger:** No sales orders
**Expected:**
- EmptyState shown in SalesTab

### TC-05: Filter toolbar — filter by status
**Trigger:** Select status filter
**Steps:**
1. Navigate, use status filter (e.g., "completed")
**Expected:**
- URL updates with status param
- Query re-fetches with status filter
- Table shows only matching orders

### TC-06: Filter toolbar — filter by date range
**Trigger:** Enter from/to dates
**Steps:**
1. Navigate, enter from date and to date in filter toolbar
**Expected:**
- URL updates: `?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Table updates

### TC-07: Filter toolbar — filter by branch
**Trigger:** Select branch filter
**Steps:**
1. Select a branch in filter toolbar
**Expected:**
- `branchId` param in URL
- Table filtered by branch

### TC-08: Filter toolbar — clear filters
**Trigger:** Click clear/reset
**Steps:**
1. Apply some filters
2. Click clear
**Expected:**
- All filter params reset to defaults
- Table shows unfiltered data

### TC-09: Period quick-select
**Trigger:** Select period (today/this_week/etc.)
**Steps:**
1. Navigate, select a period
**Expected:**
- `getPeriodDates` computes from/to dates for period
- URL updates with computed dates
- Table updates

### TC-10: Pagination — navigate pages
**Trigger:** If more than page size, paginate
**Steps:**
1. With 20+ orders, click next page
**Expected:**
- `page` param in URL increments
- Next page of orders fetched

### TC-11: New Sale button
**Trigger:** Click "New Sale" / Plus button
**Steps:**
1. Click the Plus button
**Expected:**
- Navigate to `/dashboard/sales/create`

### TC-12: Row click — navigate to order detail
**Trigger:** Click a sales row
**Steps:**
1. Click on any order row
**Expected:**
- Navigate to `/dashboard/sales/<order_id>`

### TC-13: Payments tab — populated
**Trigger:** Switch to Payments tab
**Steps:**
1. Click "Payments" tab
**Expected:**
- PaymentDataTable rendered with invoice data
- Columns: date, invoice #, sales order, payment mode, total paid, customer, created by, e-invoice status

### TC-14: Error state — API failure
**Trigger:** Simulate API error
**Expected:**
- ErrorCard shown with "Failed to load data" heading and "Try Again" button

### TC-15: Retry on error
**Trigger:** Click "Try Again" in ErrorCard
**Expected:**
- `refetch()` called
- Loading state shown; data re-fetched

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.salesOrders.list({ organizationId, from, to, status, branchId, page, limit })` | TC-03, TC-05, TC-06, TC-07, TC-10 |
| `client.invoices.list({ organizationId })` | TC-13 |

## Edge Cases

### EC-01: Invalid date params in URL
**Setup:** Navigate with `?from=notadate&to=alsonotadate`
**Expected:** Zod schema with `.default("")`; filter toolbar displays empty; query returns unfiltered

### EC-02: Negative page number
**Setup:** Navigate with `?page=0` or `?page=-1`
**Expected:** Zod schema has `min(1).default(1)`; treated as page 1

### EC-03: Revenue calculation excludes cancelled
**Setup:** Mix of completed, cancelled, pending orders
**Expected:** `totalRevenue` filters out `status === "cancelled"` rows

## Known Gaps
- Exact FilterToolbar implementation (branch selector, period picker) not inspected
- Column definitions in `columns` files not reviewed
- Payments tab column `e_invoice_status` behavior unknown
