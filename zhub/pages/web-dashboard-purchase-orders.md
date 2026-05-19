# Purchase Orders

**Route:** `/dashboard/purchase-orders/view`
**Files:**
- `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx` (route stub)
- `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.lazy.tsx` (lazy component)
**Platform:** web
**Auth required:** authenticated + rbac(`purchase_order_management:read`)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** Manage purchase orders and the supplier-invoice intake / 3-way match workflow in one place — create POs, approve, receive items, record supplier invoices, review match, mark invoices paid.

**Produces:** Header (icon + title + "New PO" button) and two tabs:
- **Purchase Orders**: data table with PO #, supplier, branch, order date, expected delivery, total, status, contextual action buttons (Approve / Receive / Cancel / Invoice).
- **Supplier Invoices** (`SupplierInvoicesTab`): filterable invoice table (Invoice #, Supplier, PO, dates, amount, status) with "Review Match" / "Mark Paid" actions.

**On success:**
- PO created (draft) via `CreatePOSheet`, toast confirmation.
- PO approved (draft → approved).
- Items received via `ReceiveItemsSheet` (status updates accordingly).
- PO cancelled (draft/approved → cancelled).
- Invoice recorded via `RecordInvoiceDialog` from a received PO.
- Invoice matched/disputed via `MatchReviewDialog` (3-way comparison).
- Invoice marked paid via `MarkPaidDialog`.

**On failure / error states:** Loading spinner; empty-state CTA "New PO"; `DataTable` error props (`error`, `onRetry`) drive inline error UX; toast errors from `useApiMutation`.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent (view.lazy.tsx)
  → useUserContext() → organizationId, hasPermission
    → canCreate = "purchase_order_management:create"
    → canUpdate = "purchase_order_management:update"
  → useQuery(["purchaseOrders", organizationId])
      → client.purchaseOrders.list({ organizationId })
  → Tabs: "orders" | "invoices"

  Orders tab actions (per row, by status):
    → draft       → Approve  → useApiMutation → client.purchaseOrders.approve
    → approved/ordered/partially_received → Receive → ReceiveItemsSheet
    → draft/approved → Cancel  → useApiMutation → client.purchaseOrders.cancel
    → received/partially_received → Invoice → RecordInvoiceDialog

  Invoices tab (SupplierInvoicesTab):
    → useQuery(["supplierInvoices", orgId]) → client.goodsReceipts.listInvoices
    → useQuery(["suppliers", orgId]) → client.suppliers.list (name map)
    → pending/disputed → Review Match → MatchReviewDialog
    → matched          → Mark Paid    → MarkPaidDialog
```

**Dialog mutations:**
- `CreatePOSheet` → `client.purchaseOrders.create` (items: cents)
- `ReceiveItemsSheet` → `client.purchaseOrders.receiveItems` (per-item received qty)
- `RecordInvoiceDialog` → `client.goodsReceipts.createInvoice` (optional `goodsReceiptId`)
- `MatchReviewDialog` → `client.goodsReceipts.getInvoicePreview` (3-way), then `matchInvoice` or `disputeInvoice`
- `MarkPaidDialog` → `client.goodsReceipts.markInvoicePaid`

**State management:**
- TanStack Query: `["purchaseOrders", orgId]`, `["purchaseOrders", orgId, poId]`, `["supplierInvoices", orgId]`, `["suppliers", orgId]`, `["products", orgId]`, `["goodsReceiptsForPo", orgId, poId]`, `["invoicePreview", orgId, invoiceId]`.
- Local state in route: `createSheetOpen`, `receivePoId`, `invoicePoId`.
- `useApiMutation` wraps each mutation with toast + cache invalidation (`["purchaseOrders", orgId]`).
- `handleInvalidate` callback passed to all child sheets/dialogs.

**Side effects:** Creates/approves/cancels POs, receives items, records/matches/disputes/pays invoices; invalidates relevant queries on success.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.purchaseOrders.list/getById/create/approve/cancel/receiveItems`
- `client.suppliers.list` (for supplier dropdowns and name map)
- `client.products.list` (line-item product picker, receive-items name map)
- `client.goodsReceipts.listInvoices` — supplier-invoice table
- `client.goodsReceipts.listForPo` — posted receipts for invoice recording
- `client.goodsReceipts.createInvoice` — record invoice
- `client.goodsReceipts.getInvoicePreview` — 3-way match preview
- `client.goodsReceipts.matchInvoice` / `disputeInvoice` / `markInvoicePaid`

**Uses these components (under `@/features/purchase-orders/`):**
- `POStatusBadge` — domain status → canonical `StatusBadge` mapping
- `InvoiceStatusBadge` — invoice status → canonical
- `CreatePOSheet` — `Dialog`-based create form with supplier/branch/dates/line items
- `ReceiveItemsSheet` — per-item received-qty form (uses PO `getById`)
- `RecordInvoiceDialog` — invoice intake; optional goods-receipt link
- `MatchReviewDialog` — 3-way preview table + Match/Dispute
- `MarkPaidDialog` — payment reference capture
- `SupplierInvoicesTab` — full invoices tab body

Shared UI: `DataTable` (`@/components/tables/sales/view/data-table`), `CopyableCell`, `BranchSelector`, `PageLoader`, `LoadingSpinner`, shadcn primitives.

**Uses these hooks:**
- `useUserContext()`, `useQuery`, `useQueryClient`, `useApiMutation` (`@/hooks/useApiMutation`), `useState`, `useCallback`

**Navigation: who navigates here:** Sidebar; direct URL.

**Navigation: where it goes:** None — all interactions are modal.

---

## 4. Data Shapes

**DB tables touched:**
- `purchase_orders`, `purchase_order_items` (CRUD via PO procedures)
- `goods_receipts`, `goods_receipt_items` (receive flow)
- `supplier_invoices` (intake / match / pay)
- `suppliers` (read), `products` (read)

**Key types:**
```typescript
// apps/web/src/features/purchase-orders/types.ts
export type PurchaseOrderRow = {
  id: string;
  purchaseOrderNumber: string;
  supplierId: string;
  branchId: string;
  orderDate: Date | string | null;
  expectedDeliveryDate: Date | string | null | undefined;
  totalAmount: number;            // cents
  status: string;                  // "draft" | "approved" | "ordered" | "partially_received" | "received" | "cancelled"
  notes: string | null | undefined;
  createdAt: Date | string | null;
};

export type LineItem = {
  key: string;                     // crypto.randomUUID
  productId: string;
  orderedQty: string;
  unitCostRM: string;              // user-entered RM, converted to cents via rmToCents()
};
```

`purchaseOrders.create` input: `{ organizationId, supplierId, branchId, orderDate (ISO), expectedDeliveryDate?, notes?, items: [{ productId, orderedQty, unitCost (cents) }] }`.
`purchaseOrders.receiveItems` input: `{ organizationId, purchaseOrderId, items: [{ itemId, receivedQty }] }`.
`goodsReceipts.createInvoice` input: `{ organizationId, invoiceNumber, supplierId, purchaseOrderId, goodsReceiptId?, totalCents, taxCents?, invoiceDate (ISO), dueDate? (ISO) }`.

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/purchase-orders.test.tsx` (predates refactor; may need updates for `features/` paths).

**Not tested / risk areas:**
- New `SupplierInvoicesTab` (filter, columns, status conditional buttons).
- `MatchReviewDialog` 3-way preview rendering + dispute branch.
- `RecordInvoiceDialog` optional goods-receipt link.
- `MarkPaidDialog` reference capture flow.
- `CreatePOSheet` RM→cents conversion (`rmToCents`) and per-line `crypto.randomUUID` keying.

---

## 6. Notes

- **Refactor**: Route split into `view.tsx` (stub) + `view.lazy.tsx` (component) for code-splitting. All feature logic moved into `apps/web/src/features/purchase-orders/` (components + `types.ts`).
- **Supplier invoices moved here** from the legacy suppliers route; they now live as a tab under Purchase Orders (`SupplierInvoicesTab`).
- **Currency**: PO line items and invoice totals are entered in RM and converted to cents on submit via `rmToCents` (`@/lib/money`). `formatPrice(cents, "MYR")` for display.
- **Status mapping**: `POStatusBadge` maps `ordered → confirmed (Ordered)`, `partially_received → in_transit (Partial)`. `InvoiceStatusBadge` maps `matched → approved`, `disputed → cancelled`.
- **Action gating**: `canCreate`/`canUpdate` derived from permissions; action buttons are status- + permission-conditional.
- **Mutation pattern**: All mutations use `useApiMutation` for centralised toast + invalidation. Cache invalidation is funnelled through `handleInvalidate` (PO list) plus per-dialog `qc.invalidateQueries(["supplierInvoices", orgId])`.
