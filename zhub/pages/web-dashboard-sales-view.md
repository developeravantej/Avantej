# Sales View

**Route:** `/dashboard/sales/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** View a list of all sales orders for the current organization.
**Produces:** A sortable table of sales orders with date, order number, total (MYR), customer name, and created-by.
**On success:** Sales order rows appear in the table.
**On failure / error states:**
- Loading: centered spinner.
- API error: destructive message with a "Try Again" button.
- No organization: query is disabled, table renders empty.
- Empty result: table renders with no rows.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId
  → useQuery(["salesOrders", organizationId])
      → client.salesOrders.list({ organizationId })
        → salesOrdersRouter.list → requirePermission("sales", "read")
        → listSalesOrders(tenantDb, { accessibleNodeIds, ... })
      → returns SalesOrder[]
  → maps to SalesRow[] (date ISO string, salesOrderNumber, totalAmount, customerName, createdBy)
  → <DataTable columns={columns} data={data} />
```

**Inputs:** `organizationId` from user context (no user-facing filters).
**State management:** TanStack Query cache keyed on `["salesOrders", organizationId]`; `isError`/`refetch` for error recovery.
**Outputs:** Table with columns: Date, Sales Order (copyable), Total Sales (MYR), Customer Name, Created By (with avatar initials), Actions (View/Edit buttons — currently unimplemented stubs).
**Side effects:** None — read-only page with no mutations.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `salesOrders.list` — list all sales orders for org; requires `sales:read`. Respects `accessibleNodeIds` for RBAC scoping.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table wrapper.
- `columns` / `SalesRow` — `apps/web/src/components/tables/sales/view/columns.tsx` — column definitions.
- `Button` — `apps/web/src/components/ui/button.tsx` — "Try Again" on error.

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`.
- `useQuery` (TanStack Query).

**Navigation: who navigates here:**
- Sidebar "Sales & Inventory → Sales" link (`apps/web/src/components/app-sidebar.tsx:156`).
- "Back to Sales Orders" link from `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx`.

**Navigation: where it goes:** Intended to navigate to `/dashboard/sales/$id` from the "View" action button — currently the action only `console.log`s (not yet wired).

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `sales_orders` | SELECT | `id`, `salesOrderNumber`, `date`, `totalAmount`, `customerName`, `createdBy`, `status`, `branchId` |

**Key types:**
```typescript
interface SalesRow {
  date?: string | null;        // ISO string
  sales_order?: string | null; // salesOrderNumber
  total_sales?: number;        // integer cents
  customer_name?: string | null;
  created_by?: string | null;
}
```

---

## 5. Tests

**Test files:** `apps/server/src/tests/unit/services/sales-order.test.ts` (service-layer unit tests).
**Scenarios covered:** `listSalesOrders`, `createSalesOrder`, `getSalesOrderById`, `updateSalesOrder`, `cancelSalesOrder` at service layer.
**Not tested:** Frontend component rendering, error/loading states, table column behavior.

---

## 6. Notes

- The "View" and "Edit" action buttons in the columns file (`apps/web/src/components/tables/sales/view/columns.tsx:143-161`) currently only `console.log` — navigation to `/dashboard/sales/$id` is not wired yet.
- `listSalesOrders` is scoped by `accessibleNodeIds` so staff see only orders in their hierarchy scope.
- No filters (status, date range, customer) are exposed in the UI — all orders for the org are fetched.
- `total_sales` in `SalesRow` holds the raw cents value from the API; `formatPrice(totalSales, "MYR")` is called in the column cell.
- The same `DataTable` component from `tables/sales/view/data-table.tsx` is reused by payouts, promotions, and purchase-orders pages (these pages pass their own columns and data types).
