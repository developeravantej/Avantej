# Sales & Payments

**Route:** `/dashboard/sales/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx`
**Platform:** web
**Auth required:** authenticated (rbac `sales:read` enforced server-side)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Two-tab "Sales & Payments" workspace — orders tab with KPI cards, filters, sortable sales-order table; payments tab with invoice/payment table.

**Produces:**
- Page header with count summary (`N orders · M invoices`) and "New Sale" link.
- Tabs: **Sales Orders** (default) and **Payments**, each with a count chip.
- Sales tab: 4 KPI cards (Total Orders, Total Revenue, Completed, Cancelled), `FilterToolbar` (from/to dates, status, branch, Clear), then paginated `SalesDataTable` (page size 50).
- Payments tab: `PaymentDataTable` for invoices in scope.

**On success:** Tables render under their tab with current filters/page applied.

**On failure / error states:**
- `<PageLoader />` while loading.
- `ErrorCard` with "Try Again" button on fetch failure (per tab).
- DataTable empty state ("No sales found" / "No payments found"); empty sales offers a "New Sale" CTA via `useNavigate`.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId
  → Route.useSearch() → { from, to, status, branchId, page, period }
  → derivedFilters = period && !from && !to ? getPeriodDates(period) : { from, to }

  → useQuery(["salesOrders", orgId, from, to, status, branchId, page])
      → client.salesOrders.list({ organizationId, from, to, status, branchId, limit: 50, offset })
  → useQuery(["invoices", orgId])
      → client.invoices.list({ organizationId })

  → SalesTab: KPI cards (computed from rows) + FilterToolbar + SalesDataTable
  → PaymentsTab: PaymentDataTable
```

**Inputs:** URL search params validated by `salesSearchSchema` (`from`, `to`, `status`, `branchId`, `page`, `period`).

**State management:** URL search state via `useNavigate({ from: Route.fullPath })`. TanStack Query for sales + invoices. No local state.

**Outputs:** Two data tables. "New Sale" navigates to `/dashboard/sales/create`.

**Side effects:** Read-only. Filter/page changes update URL search; no mutations.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.salesOrders.list` — paginated, filtered by `from/to/status/branchId`, scoped to `accessibleNodeIds` server-side
- `client.invoices.list` — invoices for org (payments tab)

**Uses these components:**
- `SalesDataTable` + `salesColumns` — `@/components/tables/sales/view/data-table` + `columns`
- `FilterToolbar` — `@/components/tables/sales/view/filter-toolbar`
- `PaymentDataTable` + `paymentColumns` — `@/components/tables/payment/view/...`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Button`, `PageLoader`
- Lucide icons: `CheckCircle2`, `Plus`, `ShoppingCart`, `TrendingUp`, `XCircle`

**Uses these hooks:**
- `useUserContext()` — `organizationId`
- `useQuery` x2 — sales + invoices
- `useNavigate` + `Route.useSearch()` — URL state
- `getPeriodDates(period)` from `@/lib/period` — KPI deep-link support

**Navigation: who navigates here:**
- `app-sidebar.tsx` — "Sales" link
- Dashboard KPI card with `?period=...` query

**Navigation: where it goes:**
- `/dashboard/sales/$id` — `SalesActionCell` "View" button (uses `row.original.id`)
- `/dashboard/customers/view?customerId=…` — customer name link (when `customerId` present)
- `/dashboard/sales/create` — "New Sale" header button + empty-state CTA

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns |
|-------|-----------|-------------|
| `sales_orders` (tenant) | READ | `id`, `salesOrderNumber`, `date`, `totalAmount`, `customerName`, `customerId`, `createdBy`, `status`, `branchId` |
| `invoices` (tenant) | READ | `id`, `invoiceNumber`, `salesOrderId`, `paymentMode`, `totalAmount`, `customerName`, `createdBy`, `date`, `eInvoiceStatus` |

**Key types:**
```typescript
interface SalesRow {
  id: string;
  date?: string | null;
  sales_order?: string | null;          // salesOrderNumber
  total_sales?: number;                  // cents
  customer_name?: string | null;
  customerId?: string | null;
  created_by?: string | null;
  status?: string | null;
}

// salesSearchSchema (URL search)
{ from: string; to: string; status: string; branchId: string; page: number (>=1, default 1); period?: string }
```

---

## 5. Tests

**Test files:** None found specifically for this route.

**Not tested (risk areas):**
- Filter/period derivation (`getPeriodDates` integration).
- Status whitelist (`["draft","confirmed","completed","cancelled"]`) — other values silently treated as undefined.
- Pagination via URL `page` param.
- KPI computation (revenue excludes `status === "cancelled"`).

---

## 6. Notes

- **Server-side scoping**: `salesOrders.list` filters by `context.accessibleNodeIds`; staff only see orders within their hierarchy scope.
- **Cents vs RM**: `total_sales` arrives in cents from the API; `formatPrice(amount, "MYR")` handles display.
- **`SalesActionCell`** in `columns.tsx` uses `useNavigate` to push `/dashboard/sales/$id` with `row.original.id`. Customer-name cell is a `Link` to `/dashboard/customers/view?customerId=...` when `customerId` is present.
- **`formatPrice` import path** is `@/lib/money` (post-refactor).
- **Period KPI deep-link**: When arriving from a dashboard KPI tile with `?period=…` and no explicit `from/to`, `getPeriodDates` derives the date window.
- **Status mapping for table cell**: column passes raw `status` to `StatusBadge`. Refer to detail page for `SalesStatusBadge` mapping wrapper.
