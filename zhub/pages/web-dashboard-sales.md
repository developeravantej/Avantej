# Sales & Payments

**Route:** `/dashboard/sales/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View sales orders and payments/invoices across date ranges and branches; filter by status; see revenue and order metrics.

**Produces:** Two-tab interface — Sales Orders tab with stats cards (total orders, revenue, completed, cancelled) and paginated table; Payments tab with invoice list.

**On success:**
- Sales orders loaded and filtered
- Invoices/payments loaded
- Pagination navigates between pages
- Filters applied via search params

**On failure / error states:**
- Loading spinner
- Error card with "Failed to load data" and retry button
- Empty state if no sales found
- Org guard: "Select an organization to view sales"

---

## 2. How It Works

**Execution flow:**

1. Route loads with search params: from, to, status, branchId, page, period
2. If period param set (no from/to): derive dates via getPeriodDates()
3. Fetch sales orders via client.salesOrders.list() with date range, status, branch filters, pagination (50 per page)
4. Fetch invoices via client.invoices.list() (all, for payments tab)
5. Map API rows to SalesRow[] and PaymentRow[] for table rendering
6. Calculate metrics: total orders, total revenue (excluding cancelled), completed count, cancelled count
7. Render header with counts, tabs, and filters
8. Sales tab:
   - Stats cards (4-column grid)
   - FilterToolbar component for date range, status, branch filters
   - SalesDataTable with pagination controls
   - Row click navigates to detail page
9. Payments tab:
   - Simple PaymentDataTable (no filters, no pagination shown in snippet)
10. Filter changes: navigate with updated search params, reset page to 1
11. Period-based navigation: Dashboard KPI cards can link with period param instead of date range

**Inputs:**
- Search params: from (YYYY-MM-DD), to, status, branchId, page (default 1), period (optional)
- Tab selection: orders or payments
- Filters: date range, status, branch

**State management:**
- TanStack Query keys:
  - [salesOrders, organizationId, derivedFilters.from, derivedFilters.to, status, branchId, page]
  - [invoices, organizationId]
- Router search params managed by useNavigate()
- Local state: activeTab (via Tabs component)

**Outputs:**
- Sales Orders tab: stats cards, filter toolbar, paginated table
- Payments tab: invoice table
- Tab navigation updates UI
- Table row click navigates to /dashboard/sales/:id
- New Sale button navigates to /dashboard/sales/create

**Side effects:**
- Fetches sales and invoices on mount and filter changes
- No mutations on this page (read-only)
- No cache invalidation (read-only)

---

## 3. What Depends On It

**Calls these API endpoints:**
- client.salesOrders.list() — fetch sales with filters
- client.invoices.list() — fetch invoices/payments

**Uses these components:**
- SalesDataTable from @/components/tables/sales/view/data-table — sales table
- PaymentDataTable from @/components/tables/payment/view/data-table — invoices table
- FilterToolbar from @/components/tables/sales/view/filter-toolbar — date, status, branch filters
- Tabs, TabsContent, TabsList, TabsTrigger — tab switching
- Button, Link — navigation
- Icons: ShoppingCart, TrendingUp, CheckCircle2, XCircle

**Uses these hooks:**
- useUserContext() — org ID
- useNavigate() — filter navigation
- useSearch() — read search params
- useQuery (React Query) — fetch sales and invoices

**Navigation: who navigates here:**
- Sidebar link
- Direct URL or Dashboard KPI card (with period param)

**Navigation: where it goes:**
- Row click: /dashboard/sales/:id (detail page)
- New Sale button: /dashboard/sales/create (POS)

---

## 4. Data Shapes

**DB tables touched:**
- salesOrders (select, with filters)
- invoices (select)

**Key types:**
```typescript
type SalesRow = {
  id: string;
  date: string | null;
  sales_order: string;
  total_sales: number;
  customer_name: string;
  created_by: string;
  status: string;
  customerId: string | null;
};

type PaymentRow = {
  date: string | null;
  invoice: string;
  sales_order: string | null;
  mode: string | null;
  total_paid: number;
  customer_name: string;
  created_by: string;
  e_invoice_status: string | null;
};

// API salesOrders.list() filters
{
  organizationId: string;
  from?: string; // ISO datetime
  to?: string; // ISO datetime
  status?: string;
  branchId?: string;
  limit: number; // 50
  offset: number; // (page - 1) * 50
}

// API response
{
  rows: SalesOrderRow[];
  total: number;
}

// Period type (for getPeriodDates)
type Period = string; // e.g., "today" | "week" | "month" | "year"
```

---

## 5. Tests

**Test files:** None found matching sales-view pattern

**Scenarios covered:** (none)

**Not tested (risk areas):**
- Filtering by date range, status, branch
- Pagination navigation
- Period-based date derivation
- Metrics calculation (total, revenue, completed, cancelled)
- Tab switching
- Error handling and retries
- Empty states

---

## 6. Notes

- **Date format:** Form inputs use YYYY-MM-DD; API expects ISO datetime strings (with time 00:00:00 or 23:59:59)
- **Pagination:** Server returns 50 items per page; frontend manages page param in search
- **Period param:** Alternative to date range; used by Dashboard KPI cards to show "last week", "last month", etc.
- **Metrics:** Total revenue calculated on frontend (excluding cancelled orders); completed/cancelled counts also frontend-calculated from filtered data
- **Filters:** Date range, status, branch are optional; clearing resets all filters and page to 1
- **Revenue calculation:** sum(total_sales) for non-cancelled rows
- **Stats cards:** 2-column grid on mobile, 4-column on lg screens
- **Tabs:** Custom styled tabs (border-b, underline indicator) instead of default Tabs styling
