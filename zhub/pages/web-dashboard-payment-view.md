# Payment View

**Route:** `/dashboard/payment/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (rbac `payments:read` enforced server-side)
**Last updated:** 2026-05-09

---

## New in this update

- **Payment Status History dialog added:** each payment row now has a "History" button (if `payment_id` is present) that opens a `sm:max-w-md` dialog showing cursor-paginated status transitions via `invoices.paymentStatusHistory`.
- **`PaymentRow` shape extended:** `payment_id` field added (mapped from `item.paymentId`).
- **`columns` export changed to `buildColumns` factory:** `buildColumns(onHistoryClick?)` creates column definitions with the optional History button in the actions column. A backward-compat `columns` export (no history callback) is still available.
- **`StatusTimeline` component** (`apps/web/src/components/ui/status-timeline.tsx`) — new reusable component used in the history dialog; renders a vertical timeline of `fromStatus → toStatus` transitions with changedByName, timestamp, reason, and notes. Supports `statusBadgeRenderer` override prop.
- **`invoices.paymentStatusHistory` procedure added** (cursor-paginated): accepts `{ organizationId, paymentId, cursor?, limit? }`.
- **`PaymentHistoryPanel`** inner component handles the query and passes `data?.rows` to `<StatusTimeline>`.

---

## 1. What It Does

**Purpose (user perspective):** View all invoices/payment records for the current organization — a read-mostly ledger of payments collected — with the ability to inspect the full status history of any individual payment.

**Produces:** A page with a header (CreditCard icon, "Payments" title, "View and manage invoice payments." subtitle, and Separator), followed by a sortable data table showing payment date, invoice number, linked sales order, payment mode, total paid (MYR), customer name, created-by, and e-invoice status. Each row with a `payment_id` has a "History" button that opens a dialog with the `StatusTimeline`.

**On success:**
- Table renders all invoices for the org.
- History dialog opens and loads status transitions for the selected payment.

**On failure / error states:**
- Spinner (`<PageLoader />`) while loading invoices.
- DataTable error state with "No payments found" / error message / "Try Again" button on fetch failure.
- Empty table: "No payments found. Invoice payments will appear here once sales are recorded."
- History dialog loading: three skeleton rows.
- History dialog empty: "No history available."

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId
  → selectedPaymentId state (null initially)
  → useQuery(["invoices", organizationId])
      → client.invoices.list({ organizationId })
        → invoicesRouter.list (rbac: payments:read)
  → maps API data to PaymentRow[] (now includes payment_id from item.paymentId)
  → columns = useMemo(() => buildColumns((paymentId) => setSelectedPaymentId(paymentId)), [])
  → <DataTable columns={columns} data={paymentsData} .../>
      → row with payment_id → "History" button → onHistoryClick(payment_id)
      → row → "View" button → navigate to /dashboard/sales/$id using sales_order as id param
  → <Dialog open={selectedPaymentId !== null}>
      → <PaymentHistoryPanel organizationId paymentId={selectedPaymentId} />
          → useQuery(["invoices", "paymentStatusHistory", paymentId])
              → client.invoices.paymentStatusHistory({ organizationId, paymentId })
          → <StatusTimeline entries={data?.rows ?? []} isLoading={isLoading} />
```

**State management:**
- `selectedPaymentId: string | null` — local state; set by clicking "History" on a row, cleared when dialog closes.
- TanStack Query: `["invoices", organizationId]` for the main list; `["invoices", "paymentStatusHistory", paymentId]` per payment (fetched when dialog opens, not eagerly).

**Inputs:** None for the main list — all invoices for the org are fetched without filters. History dialog driven by row click.

**Outputs:**
- `DataTable<PaymentRow>` with columns: date, invoice (copyable), sales_order (copyable), mode (badge with color coding), total_paid (MYR), customer_name, created_by (avatar), e_invoice_status (badge), actions (View + optional History).
- History dialog: `StatusTimeline` vertical list of status transitions.

**Side effects:** None — read-only page (no mutations).

---

## 3. What Depends On It

**Calls these API endpoints:**
- `invoices.list` — fetch all invoices for the organization (no filters passed from this view).
- `invoices.paymentStatusHistory` — cursor-paginated payment status history; called per `paymentId` when dialog opens.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/payment/view/data-table.tsx`
- `buildColumns` / `PaymentRow` — `apps/web/src/components/tables/payment/view/columns.tsx` — factory function; History button rendered conditionally when `payment_id` is present and `onHistoryClick` is provided.
- `StatusTimeline` — `apps/web/src/components/ui/status-timeline.tsx` — **NEW**: reusable timeline component.
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` — UI dialog.
- `Separator` — page header separator.
- `PageLoader` — loading spinner.

**Uses these hooks:**
- `useUserContext` — provides `organizationId`
- `useQuery` (TanStack Query) — invoices list + per-payment history
- `useState` — `selectedPaymentId`
- `useMemo` — memoizes `buildColumns(...)` call

**Navigation: who navigates here:** Sidebar "Sales & Inventory → Payment" link.

**Navigation: where it goes:**
- `/dashboard/sales/$id` — via "View" button using `row.original.sales_order` as the ID param.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `invoices` (tenant) | READ | `id`, `invoiceNumber`, `date`, `salesOrderId`, `paymentId`, `paymentMode`, `totalAmount`, `customerName`, `createdBy`, `eInvoiceStatus` |
| `payment_status_history` (tenant) | READ (via paymentStatusHistory) | `id`, `paymentId`, `fromStatus`, `toStatus`, `changedAt`, `changedByName`, `reason`, `notes` |

**Key types:**
```typescript
interface PaymentRow {
  date?: string | null;
  invoice?: string | null;          // invoiceNumber
  sales_order?: string | null;      // salesOrderId
  payment_id?: string | null;       // paymentId — NEW; drives History button visibility
  mode?: string | null;             // paymentMode; color-coded badge: cash=green, card=blue, bank_transfer=orange
  total_paid?: number;              // cents
  customer_name?: string | null;
  created_by?: string | null;
  e_invoice_status?: string | null; // "pending" | "generated" | "sent" | "failed" | "cancelled"
}

// StatusTimeline entry (from invoices.paymentStatusHistory rows)
interface StatusTimelineEntry {
  id: string;
  fromStatus: string | null;   // null = "Initial state"
  toStatus: string;
  changedByName: string;
  changedAt: Date | string;
  reason: string | null;
  notes: string | null;
}

// paymentStatusHistory response
{ rows: StatusTimelineEntry[]; nextCursor: string | null }
```

---

## 5. Tests

**Test files:** `apps/server/src/tests/unit/services/invoice.test.ts` — covers `listInvoices` service logic; no frontend test for this route.

**Not tested (risk areas):**
- History button only renders when `payment_id` is non-null — invoices without a linked payment ID silently omit the button.
- `invoices.paymentStatusHistory` uses cursor pagination; the current UI fetches only the first page (no "load more" implemented).
- "View" action uses `row.original.sales_order` as the navigation ID — if `sales_order` is null, navigates to `/dashboard/sales/` with an empty ID param.
- E-invoice status badge falls back to `"outline"` variant for unknown status values.

---

## 6. Notes

- **`buildColumns` factory pattern:** The route creates columns via `useMemo(() => buildColumns(cb), [])` to keep the callback reference stable. The old named `columns` export (no history) is kept for backward compatibility.
- **History dialog is lazy:** `PaymentHistoryPanel` is only mounted inside the Dialog when `selectedPaymentId !== null`, so the history query only fires when the user clicks "History" on a row.
- **Cursor pagination not yet surfaced in UI:** `paymentStatusHistory` returns `nextCursor` but the current implementation fetches only the first page and displays all returned rows. No "Load More" button exists.
- **`payment_id` vs `id`:** `invoices.list` returns `paymentId` (the ID of the associated payment record); this is distinct from `item.id` (the invoice ID). The PaymentRow maps `item.paymentId` → `payment_id`.
- `invoices.list` also accepts `salesOrderId` for filtering — used by the sales detail page but not by this view.
- Page layout is `div.p-6.space-y-6` (not a full-height card like Service/Products views).
- `eInvoiceStatus` is optional from the API; column renderer handles `null` as "N/A".
- The payment permission is `payments:read` (not `sales:read`), matching the invoices router.
