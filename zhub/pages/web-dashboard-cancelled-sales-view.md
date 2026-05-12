# Cancelled Sales View

**Route:** `/dashboard/cancelled-sales/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (rbac `sales:read` enforced server-side)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** View all cancelled sales orders for the organization — a read-only audit log of cancellations.

**Produces:** A sortable data table showing cancellation date, cancellation number, linked sales order ID, cancelled amount (MYR), customer name, and cancelled-by.

**On success:** Table renders all cancelled orders sorted by cancellation date descending.

**On failure / error states:** Spinner while loading; empty table when no cancellations exist; no explicit error state rendered (errors are silent).

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext()                       # reads organizationId
  → useQuery(["cancelledSales", orgId])
    → client.cancelledSales.list({ organizationId })
      → cancelledSalesRouter.list          # rbac: sales:read
        → sales_orders (tenant DB)         # WHERE status = 'cancelled'
                                           # ORDER BY cancellationDate DESC
```

**Inputs:** None — no filter controls on this page.

**State management:** TanStack Query cache only (`cancelledSales`, `organizationId`).

**Outputs:** `DataTable<CancelledSaleRow>` with columns: date, cancellation number, sales_order (copyable), cancelled_amount, customer_name, created_by (avatar).

**Side effects:** None — read-only page.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `cancelledSales.list` — list sales orders with `status = 'cancelled'`

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/cancelled-sales/view/data-table.tsx` — table wrapper
- `columns` / `CancelledSaleRow` — `apps/web/src/components/tables/cancelled-sales/view/columns.tsx` — column defs

**Uses these hooks:**
- `useUserContext` — provides `organizationId`

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — "Cancelled Sales" link under the Sales nav group

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `sales_orders` (tenant) | READ | `id`, `cancellationNumber`, `cancellationDate`, `cancelledAmount`, `totalAmount`, `cancellationReason`, `cancelledBy`, `customerId`, `customerName` |

**Key types:**
```typescript
interface CancelledSaleRow {
  date?: string | null;               // cancellationDate as ISO string
  cancellation?: string | null;       // cancellationNumber
  sales_order?: string | null;        // salesOrderId (same as id)
  cancelled_amount?: number;          // cancelledAmount ?? totalAmount (cents)
  customer_name?: string | null;
  created_by?: string | null;         // cancelledBy
}
```

---

## 5. Tests

**Test files:** None found for this page.

**Not tested (risk areas):**
- No error handling rendered — an API error leaves the user with an empty spinner that never resolves.
- `cancelledAmount ?? totalAmount` fallback in the router could surface the full order total rather than the actual refund amount if `cancelledAmount` is null.
- No date range filter available — all-time data loaded on every visit.

---

## 6. Notes

- The router queries `sales_orders` directly (not a separate `cancelled_orders` table) — it filters `WHERE status = 'cancelled'` and maps the row to a cancellation-shaped object.
- `salesOrderId` in the returned object is actually the same as the order `id` (the router sets `salesOrderId: row.id`).
- Unlike the sales view, this page has no error UI; `isError` state from `useQuery` is not handled.
- No pagination or filtering controls — performance may degrade with large numbers of cancellations.
