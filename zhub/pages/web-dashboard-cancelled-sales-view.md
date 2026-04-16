# Cancelled Sales View

**Route:** `/dashboard/cancelled-sales/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Displays a read-only list of all cancelled sales orders for the organization.

**Produces:** A data table with columns: date, cancellation number, sales order ID, cancelled amount, customer name, and created-by (who cancelled).

**On success:** Table populated with cancelled sale records.

**On failure / error states:**
- Loading: centered spinner.
- No `organizationId`: query is disabled; empty table is shown.
- API error: not explicitly handled — query returns `[]` default.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId
  → useQuery(["cancelledSales", orgId])
      → client.cancelledSales.list({ organizationId })
  → map apiData → CancelledSaleRow[]
  → <DataTable columns data />
```

**Inputs:** No URL/query params; driven by current org.

**State management:** No local state beyond query data; TanStack Query cache keyed by `["cancelledSales", organizationId]`.

**Outputs:** Read-only table; no mutations.

**Side effects:** None.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.cancelledSales.list` — fetch cancelled sales for the org

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/cancelled-sales/view/data-table.tsx` — generic table wrapper
- `columns` — `apps/web/src/components/tables/cancelled-sales/view/columns.tsx` — `CancelledSaleRow` column definitions

**Uses these hooks:**
- `useUserContext` — org context
- `useQuery` — cancelled sales fetch

**Navigation: who navigates here:** `app-sidebar.tsx` — "Cancelled Sales" link under Sales section

**Navigation: where it goes:** Stays on page (read-only).

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `sales_orders` (or a view) | SELECT | `cancellationDate`, `cancellationNumber`, `salesOrderId`, `cancelledAmount`, `customerName`, `cancelledBy` |

**`CancelledSaleRow` type:**
```ts
{
  date: string | null;
  cancellation: string;         // cancellationNumber
  sales_order: string;          // salesOrderId
  cancelled_amount: number;     // in cents presumably
  customer_name: string;
  created_by: string;           // cancelledBy
}
```

**`cancellationDate` handling:** accepts `Date | string`; converted to ISO string for display.

---

## 5. Tests

**Test files:** None found

**Not tested:** Any scenarios

---

## 6. Notes

- This is a read-only page with no create/edit/delete actions.
- No `beforeLoad` permission guard.
- Error states are not explicitly handled — query failures result in the empty default `[]` with no user feedback.
- The `cancelledSales` router must exist in `packages/api/src/routers/cancelled-sales.ts` and be registered in the base router (confirmed in `index.ts`).
