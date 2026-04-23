# Sales Order Detail

**Route:** `/dashboard/sales/:id`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/$id.tsx`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View a single sales order with full details, associated invoices, and options to request refund or print receipt.

**Produces:** Header with back button and order info (number, status, date), order summary card, invoices list, print receipt dialog, refund request dialog.

**On success:**
- Order detail loaded and displayed
- Refund request dialog opened and submitted (navigates to refund page)
- Receipt printed or viewed

**On failure / error states:**
- Loading spinner during order fetch
- Error card: "Order not found" with error message and back button
- Toast errors on refund request

---

## 2. How It Works

**Execution flow:**
1. Route extracts `id` param from URL
2. Fetches order detail via `client.salesOrders.getById()`
3. Fetches invoices for order via `client.invoices.list()`
4. Optionally fetches receipt data via `client.pos.getReceiptData()` (on-demand when print dialog opens)
5. Displays order summary: total amount, customer, created by, status, customer type, notes
6. Displays invoices list (if any) with invoice number, total, status
7. "Request Refund" button (if hasPermission refund_management:create)
   - Opens RequestRefundDialog component
   - Pre-fills with order ID, customer name, suggested amount
8. "Print Receipt" button
   - Opens Dialog with ReceiptView component
   - Loads receipt data from API (if available) or builds from order/invoices data
   - "Print" button triggers window.print()
9. Legacy refund indicator: if order has cancelledAmount > 0, shows "Already refunded (legacy)" message

**Inputs:**
- URL param: `id` (sales order ID)

**State management:**
- TanStack Query: `["salesOrders", id]`, `["invoices", "by-order", id]`, `["pos-receipt", organizationId, id]`
- Local state: printDialogOpen, refundDialogOpen
- Receipt data lazy-loaded only when printDialogOpen is true

**Outputs:**
- Order detail card with summary fields
- Invoices list (if any)
- Refund and print dialogs (conditionally rendered)
- Back button navigation

**Side effects:**
- Fetches order, invoices, and (optionally) receipt data
- No cache invalidation (read-only)
- No mutations on this page

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.salesOrders.getById()` — fetch single order by ID
- `client.invoices.list()` — fetch invoices for order
- `client.pos.getReceiptData()` — fetch formatted receipt data (optional, on-demand)

**Uses these components:**
- `ReceiptView` from `@/components/pos/receipt-view` — render receipt data
- `RequestRefundDialog` from `@/components/refunds/request-refund-dialog` — refund request form
- `Link, Button, Card, CardHeader, CardTitle, CardContent, Dialog, DialogContent, StatusBadge, StatusCallout` — UI
- `ArrowLeft, Printer` icons — button icons

**Uses these hooks:**
- `useUserContext()` — org ID, permission checks (refund_management:create)
- `useQuery` (React Query) — fetch order, invoices, receipt
- `useState` — dialog state
- `Route.useParams()` — extract URL id param

**Navigation: who navigates here:**
- Sales list table row click
- Direct URL
- Create sale → redirect on success

**Navigation: where it goes:**
- "Back to Sales Orders" link → `/dashboard/sales/view`
- None other (dialogs are modals)

---

## 4. Data Shapes

**DB tables touched:**
- `salesOrders` (select)
- `invoices` (select, where salesOrderId = id)

**Key types / Zod schemas:**
```typescript
// From API
type SalesOrder = {
  id: string;
  salesOrderNumber: string;
  date?: Date | null;
  customerName?: string | null;
  customerType?: "member" | "walk_in" | null;
  status: string; // "draft" | "pending" | "processing" | "confirmed" | "sent" | "partially_paid" | "paid" | "completed" | "overdue" | "cancelled" | "rejected"
  totalAmount?: number | null; // in cents?
  createdBy?: string | null;
  notes?: string | null;
  cancelledAmount?: number; // legacy refund (in cents)
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount?: number | null;
  date?: Date | null;
  customerName?: string | null;
  createdBy?: string | null;
  paymentMode?: string | null;
  eInvoiceStatus?: string | null;
  salesOrderId?: string | null;
};

// Status mapping (for canonical StatusBadge)
const STATUS_MAP: Record<string, { status: CanonicalStatus; label?: string }> = {
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

type ReceiptData = {
  salesOrderNumber: string;
  invoiceNumber: string;
  date: Date;
  customerName: string;
  customerType: "member" | "walk_in";
  items: any[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string;
};
```

---

## 5. Tests

**Test files:** None found matching sales-detail pattern in `__tests__/`

**Scenarios covered:** (none currently)

**Not tested (risk areas):**
- Order fetch error handling
- Missing order fallback
- Invoice list rendering
- Receipt data loading and display
- Refund dialog integration
- Print functionality
- Legacy refund indicator (cancelledAmount display)
- Permission checks (refund_management:create)

---

## 6. Notes

- **Status mapping:** Converts POS/sales domain statuses to canonical UI equivalents; "processing", "sent", "partially_paid", "overdue" mapped with label overrides.
- **Legacy refunds:** Orders can have a `cancelledAmount` from pre-refund-ledger era; displayed as informational alert if > 0.
- **Receipt data:** API endpoint `pos.getReceiptData()` may not exist on all servers; graceful fallback uses `buildReceiptData()` to construct receipt from order + invoices. Items array will be empty in fallback.
- **Printing:** Standard browser `window.print()` call; receipt view likely has `print:hidden` class to hide UI elements.
- **Customer type:** Determined at order creation time (member or walk_in); used in receipt.
- **Invoices:** Optional; if order has no invoices, none displayed. Multiple invoices possible per order.
- **Refund dialog:** Pre-filled with order ID, customer name, and total amount as suggested (user can adjust).
