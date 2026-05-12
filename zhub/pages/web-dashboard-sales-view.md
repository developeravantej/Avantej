# Sales View

**Route:** `/dashboard/sales/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (rbac `sales:read` enforced server-side)
**Last updated:** 2026-04-20

---

## 1. What It Does

**Purpose (user perspective):** View a list of all sales orders for the current organization.

**Produces:** A sortable data table showing date, sales order number, total amount (MYR), customer name, and created-by for every sales order, plus a "New Sale" button in the header.

**On success:** Table renders with all visible sales orders, scoped to the user's accessible hierarchy nodes.

**On failure / error states:** Spinner while loading; error card with "Try Again" button on fetch failure; empty table when no orders exist.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext()                  # reads organizationId
  → useQuery(["salesOrders", orgId])
    → client.salesOrders.list({ organizationId })
      → salesOrdersRouter.list        # rbac: sales:read
        → listSalesOrders()           # service fn
          → sales_orders (tenant DB)  # filtered by accessibleNodeIds
```

**Inputs:** None (no filters or search on this page currently).

**State management:** Only TanStack Query cache (`salesOrders`, `organizationId`).

**Outputs:** `DataTable<SalesRow>` with columns: date, sales_order (copyable), total_sales, customer_name, created_by (avatar), actions (View/Edit stubs).

**Side effects:** None — read-only page.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `salesOrders.list` — list sales orders filtered by `accessibleNodeIds`

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic sortable table
- `columns` / `SalesRow` — `apps/web/src/components/tables/sales/view/columns.tsx` — column definitions

**Uses these hooks:**
- `useUserContext` — provides `organizationId`

**Navigation: who navigates here:**
- `apps/web/src/components/app-sidebar.tsx` — "Sales" link under the Sales nav group
- `apps/web/src/components/app-sidebar.tsx` — "Reports" link (also points to this route)

**Navigation: where it goes:**
- `/dashboard/sales/$id` — via "View" action button in columns (now wired via `useNavigate`; uses `row.original.id`)
- `/dashboard/sales/create` — via "New Sale" button in page header (`<Link to="/dashboard/sales/create">`)

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `sales_orders` (tenant) | READ | `id`, `salesOrderNumber`, `date`, `totalAmount`, `customerName`, `createdBy`, `status`, `branchId` |

**Key types:**
```typescript
interface SalesRow {
  date?: string | null;
  sales_order?: string | null;    // salesOrderNumber
  total_sales?: number;           // cents
  customer_name?: string | null;
  created_by?: string | null;
}
```

---

## 5. Tests

**Test files:** None found specifically for this route.

**Not tested (risk areas):**
- "View" and "Edit" action buttons in the columns file use `console.log` — they are not wired to any navigation or mutation.
- No client-side filtering or pagination — large datasets may be slow.

---

## 6. Notes

- The `list` procedure filters by `context.accessibleNodeIds` so staff members only see orders from their hierarchy scope.
- `total_sales` is in cents from the API; the `formatPrice(amount, "MYR")` call in the column renderer handles display.
- The "Actions" column in `columns.tsx` has a single "View" button that navigates to `/dashboard/sales/$id` using `row.original.id`. The "Edit" button was removed. `SalesRow` now includes `id: string` to support this navigation.
- Amounts/dates are mapped from API response shapes before passing to `SalesRow` (`.toISOString()` for dates).
