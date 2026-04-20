# Payment View

**Route:** `/dashboard/payment/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (rbac `payments:read` enforced server-side)
**Last updated:** 2026-04-20

---

## 1. What It Does

**Purpose (user perspective):** View all invoices/payment records for the current organization — a read-only ledger of payments collected.

**Produces:** A page with a header (CreditCard icon, "Payments" title, "View and manage invoice payments." subtitle, and Separator), followed by a sortable data table showing payment date, invoice number, linked sales order, payment mode, total paid (MYR), customer name, created-by, and e-invoice status. Content is wrapped in `div.p-6.space-y-6`.

**On success:** Table renders all invoices for the org.

**On failure / error states:** Spinner while loading; error card with "Try Again" button on fetch failure; empty table when no invoices exist.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext()                    # reads organizationId
  → useQuery(["invoices", orgId])
    → client.invoices.list({ organizationId })
      → invoicesRouter.list             # rbac: payments:read
        → listInvoices()                # service fn
          → invoices (tenant DB)
```

**Inputs:** None — no filter controls on this page.

**State management:** TanStack Query cache only (`invoices`, `organizationId`).

**Outputs:** `DataTable<PaymentRow>` with columns: date, invoice (copyable), sales_order (copyable), mode (badge), total_paid, customer_name, created_by (avatar), e_invoice_status (badge), actions (View/Edit stubs).

**Side effects:** None — read-only page.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `invoices.list` — fetch all invoices for the organization (no filters passed)

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/payment/view/data-table.tsx` — table wrapper
- `columns` / `PaymentRow` — `apps/web/src/components/tables/payment/view/columns.tsx` — column defs including `formatEInvoiceStatus` badge

**Uses these hooks:**
- `useUserContext` — provides `organizationId`

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — "Payment" link under the Sales nav group

**Navigation: where it goes:** `/dashboard/sales/$id` — via "View" action button in columns (now wired via `useNavigate`; uses `row.original.sales_order` as the ID param). "Edit" button removed.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `invoices` (tenant) | READ | `id`, `invoiceNumber`, `date`, `salesOrderId`, `paymentMode`, `totalAmount`, `customerName`, `createdBy`, `eInvoiceStatus` |

**Key types:**
```typescript
interface PaymentRow {
  date?: string | null;
  invoice?: string | null;          // invoiceNumber
  sales_order?: string | null;      // salesOrderId
  mode?: string | null;             // paymentMode
  total_paid?: number;              // cents
  customer_name?: string | null;
  created_by?: string | null;
  e_invoice_status?: string | null; // "pending" | "generated" | "sent" | "failed" | "cancelled"
}
```

---

## 5. Tests

**Test files:** `apps/server/src/tests/unit/services/invoice.test.ts` — covers `listInvoices` service logic; no frontend test for this route.

**Not tested (risk areas):**
- "View" action in columns navigates to `/dashboard/sales/$id` using `row.original.sales_order` as the ID param. "Edit" button was removed.
- `invoices.list` is called without any filters so every invoice is fetched; no pagination.
- E-invoice status badge covers known statuses; unknown values fall back to `"outline"` variant.

---

## 6. Notes

- Page now includes a styled header with `CreditCard` icon from lucide-react, title, subtitle, and a `Separator` before the data table.
- This page maps invoice API data to `PaymentRow` shape in the component before passing to DataTable — date gets `.toISOString()`, amount stays in cents for `formatPrice`.
- `eInvoiceStatus` is an optional field from the API; the column renderer handles `null` as "N/A".
- The payment permission is `payments:read` (not `sales:read`), matching the invoices router.
- `invoices.list` also accepts `salesOrderId` for filtering — used by the sales detail page but not by this view.
