# Sales Order Detail

**Route:** `/dashboard/sales/$id`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** View the full details of a single sales order including order summary and linked invoices.
**Produces:** A detail page with order header (order number, status, date), an Order Summary card (total, customer name, created by, customer type, notes), and an Invoices card (if any exist).
**On success:** Order details and invoices render.
**On failure / error states:**
- Loading: centered spinner.
- Order not found or API error: "Back to Sales Orders" button + "Order not found." message.
- No organization: query is disabled; same not-found path after load.

---

## 2. How It Works

**Execution flow:**
```
SalesOrderDetailPage
  → Route.useParams() → { id }
  → useUserContext() → organizationId
  → useQuery(["salesOrders", id])
      → client.salesOrders.getById({ organizationId, id })
        → salesOrdersRouter.getById → requirePermission("sales", "read")
        → getSalesOrderById(tenantDb, id)
  → useQuery(["invoices", "by-order", id])
      → client.invoices.list({ organizationId, salesOrderId: id })
        → invoicesRouter.list → requirePermission("sales", "read")
  → renders Card + Invoices Card
```

**Inputs:** `$id` URL path parameter (sales order UUID).
**State management:** Two TanStack Query keys; no local state.
**Outputs:**
- Order header: `salesOrderNumber`, `status` badge, `date`.
- Order Summary card (dl grid): `totalAmount` (MYR), `customerName`, `createdBy`, `status`, `customerType`, `notes`.
- Invoices card: list of `invoiceNumber`, `totalAmount`, `status` badge per invoice.
**Side effects:** None — read-only page.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `salesOrders.getById` — fetch single sales order by ID; requires `sales:read`.
- `invoices.list` — fetch invoices filtered by `salesOrderId`; requires `sales:read`.

**Uses these components:**
- `Card`, `CardContent`, `CardHeader`, `CardTitle` — `apps/web/src/components/ui/card.tsx`.
- `Badge` — `apps/web/src/components/ui/badge.tsx`.
- `Button` — `apps/web/src/components/ui/button.tsx`.
- `Link` — TanStack Router `Link` component.
- `StatusBadge` — inline helper mapping status strings to badge variants.

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId`.
- `Route.useParams()` — extracts `id` from URL.
- `useQuery` (two queries).

**Navigation: who navigates here:** Sales list view actions ("View" button in `apps/web/src/components/tables/sales/view/columns.tsx:143`) — note: the View button currently only `console.log`s and does not navigate; no direct navigation wired yet.
**Navigation: where it goes:** "Back to Sales Orders" button → `/dashboard/sales/view`.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `sales_orders` | SELECT | `id`, `salesOrderNumber`, `date`, `customerName`, `customerId`, `customerType`, `createdBy`, `status`, `totalAmount`, `notes` |
| `invoices` | SELECT | `id`, `invoiceNumber`, `totalAmount`, `status` |

**Key types:**
```typescript
// Order returned from salesOrders.getById
{
  id: string; salesOrderNumber: string;
  date: Date | null; status: string | null;
  totalAmount: number | null; // cents
  customerName: string | null; createdBy: string | null;
  customerType: string | null; notes: string | null;
}
// Invoice row
{ id: string; invoiceNumber: string; totalAmount: number | null; status: string | null }
// StatusBadge variants: confirmed/completed/paid → "default", pending/processing/draft/sent/partially_paid → "secondary",
//   cancelled/rejected → "destructive", overdue → "destructive", unknown → "outline"
```

---

## 5. Tests

**Test files:** `apps/server/src/tests/unit/services/sales-order.test.ts` (service-layer unit tests for `getSalesOrderById`, `createSalesOrder`, etc.).
**Scenarios covered:** Service-layer CRUD at the unit level.
**Not tested:** Frontend rendering, invoice display, error/not-found UI paths.

---

## 6. Notes

- The "View" action in the sales list columns (`apps/web/src/components/tables/sales/view/columns.tsx:143`) currently only `console.log`s the row rather than navigating to this page — navigation to this route is not yet wired to the table.
- `totalAmount` is in integer cents; `formatPrice(amount, "MYR")` handles display.
- Both queries are disabled when `organizationId` is null (no org selected) — the page will reach the not-found state.
- The page max-widths to `max-w-4xl` — it is a detail view, not a full-width list.
