# Sales Order Detail

**Route:** `/dashboard/sales/$id`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx:1`
**Platform:** web
**Auth required:** authenticated (rbac `sales:read` and `payments:read` enforced server-side)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** View the full details of a single sales order, including order summary and associated invoices.

**Produces:** A detail card with order metadata (number, status, date, total, customer, created-by, notes) plus a list of linked invoices with their amounts and statuses.

**On success:** Renders the order summary card; if invoices exist they appear in a second card below.

**On failure / error states:** Spinner while loading; "Order not found" message with back button on error or missing order.

---

## 2. How It Works

**Execution flow:**
```
SalesOrderDetailPage
  → Route.useParams()                    # extracts id from URL
  → useUserContext()                     # reads organizationId
  → useQuery(["salesOrders", id])
    → client.salesOrders.getById({ organizationId, id })
      → salesOrdersRouter.getById        # rbac: sales:read
        → getSalesOrderById()            # service fn
          → sales_orders (tenant DB)
  → useQuery(["invoices", "by-order", id])
    → client.invoices.list({ organizationId, salesOrderId: id })
      → invoicesRouter.list              # rbac: payments:read
        → listInvoices()                 # service fn
          → invoices (tenant DB)
```

**Inputs:**
- URL param `id` — the sales order UUID

**State management:** TanStack Query cache only.

**Outputs:** Two `Card` components — Order Summary + Invoices (if any).

**Side effects:** None — read-only page.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `salesOrders.getById` — fetch single order by id
- `invoices.list` — fetch invoices filtered by `salesOrderId`

**Uses these components:**
- `Card`, `CardContent`, `CardHeader`, `CardTitle` — `@/components/ui/card`
- `Badge` — `@/components/ui/badge` — status display via local `StatusBadge`
- `Button` / `Link` — back navigation button

**Uses these hooks:**
- `useUserContext` — provides `organizationId`

**Navigation: who navigates here:**
- `apps/web/src/components/tables/sales/view/columns.tsx` — "View" action button (currently stubbed with `console.log`, not wired to router)
- Direct URL: `/dashboard/sales/<uuid>`

**Navigation: where it goes:**
- `/dashboard/sales/view` — back button (Link component)

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `sales_orders` (tenant) | READ | `id`, `salesOrderNumber`, `date`, `status`, `totalAmount`, `customerName`, `createdBy`, `customerType`, `notes` |
| `invoices` (tenant) | READ | `id`, `invoiceNumber`, `totalAmount`, `status`, `salesOrderId` |

**Key types (from API response):**
```typescript
// salesOrders.getById returns:
{
  salesOrderNumber: string; status: string; date: Date|null;
  totalAmount: number; customerName: string|null; createdBy: string|null;
  customerType: string|null; notes: string|null;
}
// invoices.list (filtered) returns array of:
{ id: string; invoiceNumber: string; totalAmount: number; status: string; }
```

---

## 5. Tests

**Test files:** None found for this route.

**Not tested (risk areas):**
- No navigation wires the "View" action from `sales/view` to this page — it can only be reached by direct URL.
- `invoices.list` uses `payments:read` permission; if the user lacks it, invoices silently return an empty array (query enabled guard prevents call when orgId missing, but permission error would be unhandled).

---

## 6. Notes

- This page is reachable via direct URL but the list page's action buttons are not yet wired to it — they call `console.log`.
- `StatusBadge` maps status strings to badge variants locally; the same statuses exist in both sales order and invoice contexts.
- Both queries use `organizationId` as an enabled guard — if context is not yet loaded, neither query fires.
