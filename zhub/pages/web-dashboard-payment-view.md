# Payment

**Route:** `/dashboard/payment/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/payment/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Read-only register of all invoices/payments for the organization, showing date, invoice number, linked sales order, payment mode, total paid, customer name, creator, and e-invoice status.
**Produces:** A TanStack Table of payment/invoice records.
**On success:** Table populated with invoice data from the API.
**On failure / error states:** Full-page spinner while loading; error state with message and "Try Again" button on API failure; empty table when no invoices exist.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId
  → useQuery(invoices.list) → client.invoices.list({ organizationId })
  → maps apiData → PaymentRow[]
  → renders DataTable<PaymentRow>
```

**Inputs:** No URL params; no interactive form.
**State management:** TanStack Query only — no local state beyond the query result.
**Outputs:** Read-only table display; no mutations.
**Side effects:** None.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `invoices.list` — returns invoice records for the org; fields: `date`, `invoiceNumber`, `salesOrderId`, `paymentMode`, `totalAmount`, `customerName`, `createdBy`, `eInvoiceStatus`

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/payment/view/data-table.tsx`
- Static columns — `apps/web/src/components/tables/payment/view/columns.tsx` — date, invoice number (copyable), sales order (copyable), mode badge, total paid (MYR), customer name, created-by avatar, e-invoice status badge, View/Edit action buttons (currently `console.log` only)

**Uses these hooks:**
- `useUserContext` — resolves `currentOrganizationId`

**Navigation: who navigates here:**
- App sidebar under Sales section → "Payment" link

**Navigation: where it goes:** No outbound navigation (View/Edit buttons are not yet wired to routes).

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `invoices` (or equivalent) | SELECT | `date`, `invoiceNumber`, `salesOrderId`, `paymentMode`, `totalAmount`, `customerName`, `createdBy`, `eInvoiceStatus` |

**Key type:**
```typescript
interface PaymentRow {
  date?: string | null;           // ISO string
  invoice?: string | null;        // invoice number
  sales_order?: string | null;    // sales order ID
  mode?: string | null;           // payment mode
  total_paid?: number;            // cents
  customer_name?: string | null;
  created_by?: string | null;
  e_invoice_status?: string | null; // "pending" | "generated" | "sent" | "failed" | "cancelled"
}
```

**E-invoice status badge colors:** pending → secondary, generated/sent → default, failed → destructive, cancelled → outline.

---

## 5. Tests

**Test files:** None found.
**Not tested:** Anything — no test coverage for this page.

---

## 6. Notes

- The "View" and "Edit" action buttons in the columns file are stubs — they only `console.log` the row and do not navigate or open a modal.
- `total_paid` is stored/displayed in cents; the column uses `formatPrice(amount, "MYR")` from `@/lib/currency`.
- `date` field is mapped via `item.date.toISOString()` — assumes the API returns a `Date` object; will throw if the field is already a string without null guard.
- The columns file defines its own `CopyableCell` component inline rather than importing the shared `@/components/tables/copyable-cell.tsx`.
