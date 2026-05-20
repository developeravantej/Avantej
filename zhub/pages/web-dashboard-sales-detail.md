# Sales Order Detail

**Route:** `/dashboard/sales/$id`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx`
**Platform:** web
**Auth required:** authenticated (refund actions gated by `refund_management:create`)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** View a single sales order with full details, associated invoices, complete status change history, and options to request a full or partial refund, or print a receipt.

**Produces:**
- Header: back button + "Sales Order #NUMBER", status badge, date; action buttons (Request Refund, Partial Refund, Print Receipt).
- Order Summary card: Total Amount, Customer, Created By (prefers `createdByName`), Status, Customer Type, legacy refund indicator (if `cancelledAmount > 0`), Notes.
- Invoices card (when any): list of invoice number, total, and status badge per invoice.
- Status History card (`StatusHistoryCard`): vertical timeline of all status transitions for this order.
- Print Receipt dialog, Request Refund dialog, Partial Refund dialog.

**On success:** Order detail and status history render; refund dialogs submit and toast; receipt prints via `window.print()`.

**On failure / error states:**
- `<PageLoader />` while order loads.
- `StatusCallout variant="error"` with "Order not found" if `orderError` or order is null, plus back link.
- `StatusHistoryCard` loading shows three `<Skeleton>` rows; empty shows "No history available.".

---

## 2. How It Works

**Execution flow:**
```
SalesOrderDetailPage
  → Route.useParams() → id
  → useUserContext() → organizationId, hasPermission
  → canRequestRefund = hasPermission("refund_management:create")

  → useQuery(["salesOrders", id])
      → client.salesOrders.getById({ organizationId, id })
  → useQuery(["invoices", "by-order", id])
      → client.invoices.list({ organizationId, salesOrderId: id })
  → useQuery(["pos-receipt", organizationId, id])     # enabled only when printDialogOpen
      → client.pos.getReceiptData({ organizationId, salesOrderId: id })

  → render layout:
      → Order Summary card (dl grid)
      → Invoices card (when invoices.length > 0)
      → <StatusHistoryCard organizationId salesOrderId={id} />
          → useQuery(["salesOrders", "statusHistory", salesOrderId])
              → client.salesOrders.statusHistory({ organizationId, salesOrderId })
          → renders inline <ol> timeline with SalesStatusBadge transitions

  → Print Receipt dialog (lazy: printDialogOpen)
      → mapReceiptResponse(receiptDataRaw) | buildReceiptData(order, invoices)
      → "Print" → window.print()
  → Request Refund dialog (canRequestRefund) → <RequestRefundDialog>
  → Partial Refund dialog (canRequestRefund) → <PartialRefundDialog>
```

**Inputs:** URL param `id` (sales order ID); local state for three dialog open flags.

**State management:**
- TanStack Query: `["salesOrders", id]`, `["invoices", "by-order", id]`, `["pos-receipt", organizationId, id]`, `["salesOrders", "statusHistory", id]`.
- Local `useState`: `printDialogOpen`, `refundDialogOpen`, `partialRefundDialogOpen`.
- Receipt data lazy (only when print dialog open).

**Outputs:** Read-only page; mutations live inside dialogs.

**Side effects:** Fetches order, invoices, receipt (on demand), and status history. No invalidation on this page itself.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.salesOrders.getById()` — fetch single order
- `client.salesOrders.statusHistory()` — cursor-paginated status history
- `client.invoices.list({ salesOrderId })` — invoices for this order
- `client.pos.getReceiptData()` — receipt payload (on demand)

**Uses these components:**
- `ReceiptView` — `@/components/pos/receipt-view`
- `RequestRefundDialog` — `@/components/refunds/request-refund-dialog`
- `PartialRefundDialog` — `@/components/refunds/partial-refund-dialog`
- `StatusBadge` (wrapped by local `SalesStatusBadge`), `StatusCallout`, `Card`, `Dialog`, `Skeleton`, `Button`, `PageLoader`

**Uses these hooks:**
- `useUserContext()` — org ID + `hasPermission`
- `useQuery` — order, invoices, receipt, status history
- `useState` — three dialog booleans
- `Route.useParams()` — URL `id`

**Navigation: who navigates here:**
- Sales list row "View" action (`/dashboard/sales/view`)
- `TargetCell` link from refunds ledger (sales-order target)
- Direct URL, post-create redirect

**Navigation: where it goes:** "Back to Sales Orders" → `/dashboard/sales/view`. Dialogs are modal — no further outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns |
|-------|-----------|-------------|
| `sales_orders` | SELECT | `id`, `salesOrderNumber`, `date`, `customerName`, `customerType`, `status`, `totalAmount`, `createdBy`, `createdByName`, `notes`, `cancelledAmount`, `branchId` |
| `invoices` | SELECT (where `salesOrderId = id`) | `id`, `invoiceNumber`, `status`, `totalAmount`, `date`, `paymentMode`, `eInvoiceStatus` |
| `sales_order_status_history` | SELECT (via `statusHistory`) | `id`, `fromStatus`, `toStatus`, `changedAt`, `changedByName`, `reason`, `notes` |

**Key types:**
```typescript
// salesOrders.statusHistory response (cursor-paginated)
{
  rows: Array<{
    id: string;
    fromStatus: string | null;   // null = initial state
    toStatus: string;
    changedByName: string;
    changedAt: Date | string;
    reason: string | null;
    notes: string | null;
  }>;
  nextCursor: string | null;
}

// Status mapping for SalesStatusBadge (non-canonical → canonical)
const STATUS_MAP = {
  confirmed, completed, paid, pending, draft, cancelled, rejected,
  processing → pending (Processing),
  sent → confirmed (Sent),
  partially_paid → pending (Partially Paid),
  overdue → rejected (Overdue),
};
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- `StatusHistoryCard` rendering — `fromStatus === null` → "Initial state →" branch.
- Cursor pagination not surfaced in UI (only first page rendered).
- `PartialRefundDialog` integration — `branchId` cast via `(order as { branchId?: string | null }).branchId`.
- `createdByName` fallback chain (createdByName → createdBy → em-dash).
- `mapReceiptResponse` vs `buildReceiptData` fallback path.
- Legacy refund indicator (`cancelledAmount > 0`).
- Refund button gating by `refund_management:create`.

---

## 6. Notes

- **Inline timeline (not shared `StatusTimeline`)**: `StatusHistoryCard` is defined in this file and renders its own `<ol>` timeline with `SalesStatusBadge`. The shared `apps/web/src/components/ui/status-timeline.tsx` is used elsewhere (e.g. payment history dialog).
- **Cursor pagination not wired**: `statusHistory` returns `nextCursor` but no "Load More" UI exists.
- **Two refund entry points**: "Request Refund" (`RequestRefundDialog`) pre-fills `suggestedAmountCents` from `order.totalAmount`; "Partial Refund" (`PartialRefundDialog`) requires `branchId` (passes `undefined` when missing).
- **Legacy refunds**: `cancelledAmount > 0` rows pre-date the refunds ledger; displayed as amber informational field.
- **Receipt loading**: `client.pos.getReceiptData` only fires when `printDialogOpen` is true; if null/missing, `buildReceiptData(order, invoices)` returns a receipt with empty items array.
- **`formatPrice` import path** is `@/lib/money` (post-refactor; old `@/lib/currency` removed).
- **Status mapping**: Unknown statuses fall back to `{ status: "draft", label: <original> }`.
