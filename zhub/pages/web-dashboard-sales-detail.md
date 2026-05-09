# Sales Order Detail

**Route:** `/dashboard/sales/:id`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-05-09

---

## New in this update

- **`StatusHistoryCard` added** below the invoices section: fetches and renders the full status change history for the sales order via `client.salesOrders.statusHistory`. Rendered as a vertical timeline (left-border style) with `fromStatus → toStatus` transitions, changedByName, timestamp, reason, and notes.
- **`salesOrders.statusHistory` procedure added** (cursor-paginated): accepts `{ organizationId, salesOrderId }`.
- **`PartialRefundDialog` added:** a new "Partial Refund" button appears alongside "Request Refund" (both gated on `refund_management:create`). Opens `PartialRefundDialog` which requires `branchId` from the order.
- **`formatPrice` import path changed** to `@/lib/money` (was `@/lib/currency`).
- **`createdByName` field:** Order summary now prefers `order.createdByName` over `order.createdBy` for display (with fallback).
- **`StatusTimeline` component** (`apps/web/src/components/ui/status-timeline.tsx`) exists as a shared component but `StatusHistoryCard` in this file implements its own inline vertical timeline (does not use the shared component).

---

## 1. What It Does

**Purpose (user perspective):** View a single sales order with full details, associated invoices, complete status change history, and options to request full or partial refund, or print receipt.

**Produces:**
- Header: back button + "Sales Order #NUMBER", status badge, date; action buttons (Request Refund, Partial Refund, Print Receipt).
- Order Summary card: Total Amount, Customer, Created By, Status badge, Customer Type, legacy refund indicator (if `cancelledAmount > 0`), Notes.
- Invoices card (if any): list of invoice number, total, and status badge per invoice.
- Status History card (`StatusHistoryCard`): vertical timeline of all status transitions for this order, each showing `fromStatus → toStatus` (with "Initial state →" when `fromStatus` is null), changed-by name, timestamp, optional reason and notes.
- Print Receipt dialog.
- Request Refund dialog.
- Partial Refund dialog.

**On success:**
- Order detail loaded and displayed.
- Status history loaded and rendered in timeline.
- Refund request submitted (navigates to refund page).
- Receipt printed.

**On failure / error states:**
- `<PageLoader />` while order is loading.
- Error card: "Order not found" with error message and back button (uses `StatusCallout variant="error"`).
- `StatusHistoryCard` loading: three `<Skeleton>` rows.
- `StatusHistoryCard` empty: "No history available."
- Toast errors on refund request failures.

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
  → useQuery(["pos-receipt", organizationId, id])   ← enabled only when printDialogOpen
      → client.pos.getReceiptData({ organizationId, salesOrderId: id })

  → order loaded → render layout:
      → Order Summary card (dl grid)
      → Invoices card (if invoices.length > 0)
      → <StatusHistoryCard organizationId salesOrderId={id} />
          → useQuery(["salesOrders", "statusHistory", salesOrderId])
              → client.salesOrders.statusHistory({ organizationId, salesOrderId })
          → renders inline vertical timeline (left-border ol)
              → each entry: SalesStatusBadge(fromStatus) → SalesStatusBadge(toStatus)
              → fromStatus === null → "Initial state →"
              → changedByName · timestamp
              → optional reason, notes

  → Print Receipt dialog (lazy: printDialogOpen)
      → receiptDataRaw != null → mapReceiptResponse(receiptDataRaw) → <ReceiptView data />
      → fallback → buildReceiptData(order, invoices) → <ReceiptView data />
      → "Print" → window.print()

  → Request Refund dialog (canRequestRefund && refundDialogOpen)
      → <RequestRefundDialog> pre-filled: salesOrderId, customerName, suggestedAmountCents

  → Partial Refund dialog (canRequestRefund && partialRefundDialogOpen)
      → <PartialRefundDialog> with organizationId, branchId=(order as any).branchId
```

**Inputs:**
- URL param: `id` (sales order ID)
- `printDialogOpen`, `refundDialogOpen`, `partialRefundDialogOpen` local state booleans

**State management:**
- TanStack Query: `["salesOrders", id]`, `["invoices", "by-order", id]`, `["pos-receipt", organizationId, id]`, `["salesOrders", "statusHistory", id]`
- Local state: `printDialogOpen`, `refundDialogOpen`, `partialRefundDialogOpen`
- Receipt data lazy-loaded only when `printDialogOpen` is true
- Status history query always enabled (not lazy) when `organizationId` is present

**Side effects:**
- Fetches order, invoices, receipt (on demand), and status history
- No cache invalidation on this page — read-only except dialog submissions

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.salesOrders.getById()` — fetch single order by ID
- `client.invoices.list({ organizationId, salesOrderId })` — fetch invoices for this order
- `client.pos.getReceiptData({ organizationId, salesOrderId })` — receipt data (on demand)
- `client.salesOrders.statusHistory({ organizationId, salesOrderId })` — **NEW**: cursor-paginated status history

**Uses these components:**
- `ReceiptView` — `@/components/pos/receipt-view`
- `RequestRefundDialog` — `@/components/refunds/request-refund-dialog`
- `PartialRefundDialog` — `@/components/refunds/partial-refund-dialog` — **NEW**
- `StatusBadge`, `StatusCallout` — UI status components
- `Card`, `CardHeader`, `CardTitle`, `CardContent` — order and history cards
- `Dialog`, `DialogContent` — print receipt dialog
- `Skeleton` — loading state in `StatusHistoryCard`
- `Button`, `Link` — navigation and actions
- `ArrowLeft`, `Printer`, `Clock` icons (lucide-react)

**Uses these hooks:**
- `useUserContext()` — org ID, permission checks (`refund_management:create`)
- `useQuery` (React Query) — order, invoices, receipt, status history
- `useState` — three dialog state booleans
- `Route.useParams()` — extract URL `id` param

**Navigation: who navigates here:**
- Sales list table row click
- Payment view "View" button (using `sales_order` ID)
- Direct URL
- Create sale → redirect on success

**Navigation: where it goes:**
- "Back to Sales Orders" → `/dashboard/sales/view`
- No other outbound navigation (dialogs are modals)

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `sales_orders` | SELECT | `id`, `salesOrderNumber`, `date`, `customerName`, `customerType`, `status`, `totalAmount`, `createdBy`, `createdByName`, `notes`, `cancelledAmount`, `branchId` |
| `invoices` | SELECT (where salesOrderId = id) | `id`, `invoiceNumber`, `status`, `totalAmount`, `date`, `paymentMode`, `eInvoiceStatus` |
| `sales_order_status_history` | SELECT (via statusHistory) | `id`, `fromStatus`, `toStatus`, `changedAt`, `changedByName`, `reason`, `notes` |

**Key types:**
```typescript
type SalesOrder = {
  id: string;
  salesOrderNumber: string;
  date?: Date | null;
  customerName?: string | null;
  customerType?: "member" | "walk_in" | null;
  status: string;
  totalAmount?: number | null;   // cents
  createdBy?: string | null;
  createdByName?: string | null; // preferred display name
  notes?: string | null;
  cancelledAmount?: number;      // legacy refund in cents; shown if > 0
  branchId?: string | null;      // used by PartialRefundDialog
};

// salesOrders.statusHistory response
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
  confirmed: { status: "confirmed" },
  completed: { status: "completed" },
  paid: { status: "paid" },
  pending: { status: "pending" },
  processing: { status: "pending", label: "Processing" },
  draft: { status: "draft" },
  sent: { status: "confirmed", label: "Sent" },
  partially_paid: { status: "pending", label: "Partially Paid" },
  cancelled: { status: "cancelled" },
  rejected: { status: "rejected" },
  overdue: { status: "rejected", label: "Overdue" },
};
```

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- `StatusHistoryCard` rendering — especially `fromStatus === null` renders as "Initial state →".
- Cursor pagination not surfaced in the UI (only first page returned is shown).
- `PartialRefundDialog` integration — passes `branchId` cast via `(order as { branchId?: string | null })?.branchId`.
- `createdByName` fallback chain: prefers `createdByName`, then `createdBy`, then em-dash.
- `mapReceiptResponse` / `buildReceiptData` fallback — if `pos.getReceiptData` fails, receipt shows empty items array.
- Legacy refund indicator: shown if `(order as any).cancelledAmount > 0`.
- Permission gating: "Request Refund" and "Partial Refund" buttons only show when `hasPermission("refund_management:create")`.

---

## 6. Notes

- **`StatusHistoryCard` is an inline component** (not the shared `StatusTimeline` from `apps/web/src/components/ui/status-timeline.tsx`). It implements its own timeline rendering directly using `ol + li` with `SalesStatusBadge`. The shared `StatusTimeline` is used by the payment history dialog on the Payment View page instead.
- **Cursor pagination not surfaced:** `salesOrders.statusHistory` returns `nextCursor` but the current implementation fetches only the first page with no "Load More" UI.
- **Two refund dialog types:** "Request Refund" (`RequestRefundDialog`) pre-fills with order-level suggestedAmountCents. "Partial Refund" (`PartialRefundDialog`) requires `branchId` — if the order has no `branchId`, it passes `undefined`.
- **Legacy refunds:** Orders can have a `cancelledAmount` from pre-refund-ledger era; displayed as amber informational field if `> 0`.
- **Receipt data:** `pos.getReceiptData()` is loaded lazily when print dialog opens. If it returns `null`, `buildReceiptData()` constructs a receipt from order + invoices with an empty items array.
- **Printing:** Standard `window.print()` call; ReceiptView likely has `print:hidden` class on UI chrome.
- **Status mapping:** `SalesStatusBadge` is a local wrapper around the canonical `StatusBadge`. Unknown statuses fall back to `{ status: "draft", label: <original> }`.
- **`formatPrice` import:** `@/lib/money` (not `@/lib/currency` — that path no longer exists).
