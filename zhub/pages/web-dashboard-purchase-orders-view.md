# Purchase Orders View

**Route:** `/dashboard/purchase-orders/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (rbac `purchase_order_management:read`; create: `:create`; approve/receive: `:update`; cancel: `:delete`)
**Last updated:** 2026-05-09

---

## New in this update (2026-05-09)

- **Supplier Invoices tab** — second tab alongside "Purchase Orders"; renders `SupplierInvoicesTab` with status filter and `InvoiceStatusBadge`.
- **RecordInvoiceDialog** — records a supplier invoice against a PO (triggered from PO row "Invoice" action button for POs in `received`/`partially_received` status); calls `client.goodsReceipts.createInvoice`.
- **MatchReviewDialog** — 3-way match review: fetches `client.goodsReceipts.getInvoicePreview` (PO total vs receipt total vs invoice total + tolerance); approve with `matchInvoice` or dispute with `disputeInvoice`.
- **MarkPaidDialog** — confirms payment with optional payment reference; calls `client.goodsReceipts.markInvoicePaid`.
- **InvoiceStatusBadge** — maps `pending/matched/disputed/paid` to `StatusBadge` canonical variants.
- **BranchSelector component** — the branch field in CreatePOSheet is now a `BranchSelector` dropdown (was a raw UUID text input).
- **New `goodsReceipts` router procedures**: `createInvoice`, `listInvoices`, `getInvoicePreview`, `disputeInvoice`, `matchInvoice`, `markInvoicePaid`.
- **New `supplier_invoices` columns**: `disputeReason`, `disputedAt`, `paidAt`, `paidBy`, `paymentReference`.

---

## 1. What It Does

**Purpose (user perspective):** Create and manage purchase orders sent to suppliers — draft orders, approve them, record received inventory, record and reconcile supplier invoices, and cancel orders when needed.

**Produces:**
- **Purchase Orders tab:** Data table of all POs with status badges and contextual action buttons; "New PO" Dialog for creating draft orders with line items; "Receive Items" Dialog for recording received quantities; "Invoice" action to record a supplier invoice against a received PO.
- **Supplier Invoices tab:** Data table of all supplier invoices with status filter; "Review Match" button (for `pending`/`disputed` invoices) opens 3-way match dialog; "Mark Paid" button (for `matched` invoices) opens payment confirmation.

**On success:**
- Created PO → "Draft" in table.
- Approved PO → "Approved".
- Received items → `partially_received` or `received`.
- Cancelled PO → "Cancelled".
- Invoice recorded → appears in Supplier Invoices tab as "Pending".
- Invoice matched → "Matched".
- Invoice disputed → "Disputed".
- Invoice marked paid → "Paid".

**On failure / error states:** `PageLoader` while loading; toast errors on mutation failures.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext()                              # reads organizationId + hasPermission()
  → useQuery(["purchaseOrders", orgId])
    → client.purchaseOrders.list({ organizationId })
  → approveMutation  → client.purchaseOrders.approve
  → cancelMutation   → client.purchaseOrders.cancel

  PO row "Invoice" button (received/partially_received) → setInvoicePoId(id)
    → RecordInvoiceDialog
        → useQuery(["purchaseOrders", orgId, poId])   → client.purchaseOrders.getById
        → useQuery(["goodsReceiptsForPo", orgId, poId]) → client.goodsReceipts.listForPo
        → createMutation → client.goodsReceipts.createInvoice
          → invalidates ["supplierInvoices", orgId]

  CreatePOSheet (sub-component):
    → useQuery(["suppliers", orgId])  → client.suppliers.list
    → useQuery(["products", orgId])   → client.products.list
    → BranchSelector                  → client.hierarchy.listNodes (internal)
    → createMutation → client.purchaseOrders.create

  ReceiveItemsSheet (sub-component):
    → useQuery(["purchaseOrders", orgId, poId])  → client.purchaseOrders.getById
    → useQuery(["products", orgId])              → client.products.list
    → receiveMutation → client.purchaseOrders.receiveItems

  SupplierInvoicesTab (Invoices tab):
    → useQuery(["supplierInvoices", orgId])
      → client.goodsReceipts.listInvoices({ organizationId, status? })
    → useQuery(["suppliers", orgId])              → client.suppliers.list (for name map)
    → MatchReviewDialog:
        → useQuery(["invoicePreview", orgId, invoiceId])
          → client.goodsReceipts.getInvoicePreview
        → matchMutation   → client.goodsReceipts.matchInvoice
        → disputeMutation → client.goodsReceipts.disputeInvoice
    → MarkPaidDialog:
        → paidMutation → client.goodsReceipts.markInvoicePaid
```

**Inputs (Create PO Dialog):**
- Supplier (select from `suppliers.list`)
- Branch (BranchSelector component, not raw UUID text input)
- Order date (date, required)
- Expected delivery date (date, optional)
- Notes (textarea, optional)
- Line items: product (select), qty (number ≥ 1), unit cost in RM (decimal)

**Inputs (Receive Items Dialog):**
- Per-item: received quantity (number, 0 to remaining)

**Inputs (RecordInvoiceDialog):**
- Invoice number (text, required)
- Goods receipt (select from posted receipts, optional)
- Invoice total in RM (required, > 0)
- Tax amount in RM (optional)
- Invoice date (date, required)
- Due date (date, optional)

**Inputs (MatchReviewDialog):**
- Shows 3-way comparison table (PO total, receipt total, invoice total + tolerance)
- If within tolerance: "Approve Match" button → `matchInvoice`
- If mismatch detected: "Dispute Invoice" button → shows dispute reason textarea → `disputeInvoice`

**Inputs (MarkPaidDialog):**
- Payment reference (text, optional)

**State management:**
- `createSheetOpen` — Create PO Dialog visibility
- `receivePoId` — which PO's Receive Dialog is open (null = closed)
- `invoicePoId` — which PO's RecordInvoice Dialog is open (null = closed)
- `reviewInvoiceId` — invoice ID for MatchReview Dialog (inside SupplierInvoicesTab)
- `paidInvoice` — `{ id, number }` for MarkPaid Dialog (inside SupplierInvoicesTab)
- `statusFilter` — invoice status filter in SupplierInvoicesTab (not reflected in query key — note: stale filter bug possible)
- `canCreate`, `canUpdate` — permission guards

**Action button visibility (PO tab, status-driven):**
| Status | Approve | Receive | Cancel | Invoice |
|--------|---------|---------|--------|---------|
| draft | yes | — | yes | — |
| approved | — | yes | yes | — |
| ordered | — | yes | — | — |
| partially_received | — | yes | — | yes (canCreate) |
| received | — | — | — | yes (canCreate) |
| cancelled | — | — | — | — |

**Action button visibility (Invoices tab, status-driven):**
| Status | Review Match | Mark Paid |
|--------|-------------|-----------|
| pending | yes (canUpdate) | — |
| matched | — | yes (canUpdate) |
| disputed | yes (canUpdate) | — |
| paid | — | — |

**Side effects:**
- PO mutations invalidate `["purchaseOrders", organizationId]`.
- Invoice mutations invalidate `["supplierInvoices", organizationId]`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `purchaseOrders.list` — list all POs for org
- `purchaseOrders.create` — create draft PO with line items
- `purchaseOrders.approve` — approve a draft PO
- `purchaseOrders.cancel` — cancel a draft or approved PO (requires `:delete` permission)
- `purchaseOrders.getById` — load PO detail for Receive/RecordInvoice Dialogs
- `purchaseOrders.receiveItems` — record received quantities
- `goodsReceipts.listForPo` — list goods receipts for a PO (used in RecordInvoiceDialog to show posted receipts)
- `goodsReceipts.createInvoice` — record a supplier invoice against a PO
- `goodsReceipts.listInvoices` — list all supplier invoices with optional status filter
- `goodsReceipts.getInvoicePreview` — fetch 3-way match preview (`poTotalCents`, `receiptTotalCents`, `invoiceTotalCents`, `toleranceCents`, `isWithinTolerance`, `mismatches[]`)
- `goodsReceipts.matchInvoice` — approve a matched invoice (sets status to `matched`)
- `goodsReceipts.disputeInvoice` — dispute an invoice with a reason
- `goodsReceipts.markInvoicePaid` — mark invoice as paid with optional payment reference
- `suppliers.list` — populate supplier dropdown in Create Dialog and supplier name map in Invoices tab
- `products.list` — populate product dropdown in Create/Receive Dialogs

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx`
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — PO # and Invoice # cells
- `StatusBadge` — `apps/web/src/components/ui/status-badge.tsx` — via `POStatusBadge` and `InvoiceStatusBadge` local wrappers
- `BranchSelector` — `apps/web/src/components/branch/branch-selector.tsx` — branch field in CreatePOSheet
- `CreatePOSheet` (local Dialog sub-component) — new PO creation
- `ReceiveItemsSheet` (local Dialog sub-component) — recording receipts
- `RecordInvoiceDialog` (local sub-component) — recording supplier invoices
- `MatchReviewDialog` (local sub-component) — 3-way match review
- `MarkPaidDialog` (local sub-component) — confirming payment

**Uses these hooks:**
- `useUserContext` — provides `organizationId` and `hasPermission()`
- `useApiMutation` — all mutations

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — "Purchase Orders" link under the Sales nav group

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `purchase_orders` (tenant) | READ, INSERT, UPDATE | `id`, `purchaseOrderNumber`, `supplierId`, `branchId`, `orderDate`, `expectedDeliveryDate`, `totalAmount`, `status`, `notes`, `createdAt` |
| `purchase_order_items` (tenant) | READ, INSERT, UPDATE | `id`, `purchaseOrderId`, `productId`, `orderedQty`, `receivedQty`, `unitCost` |
| `supplier_invoices` (tenant) | READ, INSERT, UPDATE | `id`, `invoiceNumber`, `supplierId`, `purchaseOrderId`, `goodsReceiptId`, `totalCents`, `taxCents`, `invoiceDate`, `dueDate`, `status`, `disputeReason`, `disputedAt`, `paidAt`, `paidBy`, `paymentReference` |
| `goods_receipts` (tenant) | READ | `id`, `purchaseOrderId`, `status`, `receiptNumber`, `receivedAt` |

**Key types:**
```typescript
type PurchaseOrderRow = {
  id: string; purchaseOrderNumber: string; supplierId: string; branchId: string;
  orderDate: Date|string|null; expectedDeliveryDate: Date|string|null|undefined;
  totalAmount: number;   // cents
  status: string;        // "draft"|"approved"|"ordered"|"partially_received"|"received"|"cancelled"
  notes: string|null|undefined; createdAt: Date|string|null;
}

type InvoiceStatus = "pending" | "matched" | "disputed" | "paid";

// SupplierInvoicesTab: InvoiceRow is inferred from goodsReceipts.listInvoices return type
// Key fields: id, invoiceNumber, supplierId, purchaseOrderId, invoiceDate, dueDate, totalCents, status
```

**Invoice status → StatusBadge mapping:**
| Invoice status | CanonicalStatus | Label |
|----------------|-----------------|-------|
| pending | "pending" | "Pending" |
| matched | "approved" | "Matched" |
| disputed | "cancelled" | "Disputed" |
| paid | "paid" | "Paid" |

**`getInvoicePreview` response shape:**
```typescript
{
  poTotalCents: number | null;
  receiptTotalCents: number | null;
  invoiceTotalCents: number;
  toleranceCents: number;
  isWithinTolerance: boolean;
  mismatches: string[];   // human-readable mismatch descriptions
}
```

**Create PO form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| supplierId | select | required | `purchaseOrders.create.supplierId` |
| branchId | BranchSelector | required | `purchaseOrders.create.branchId` |
| orderDate | date | required | `purchaseOrders.create.orderDate` (→ ISO datetime) |
| expectedDelivery | date | optional | `purchaseOrders.create.expectedDeliveryDate` |
| notes | textarea | optional | `purchaseOrders.create.notes` |
| items[].productId | select | at least 1 valid item | `purchaseOrders.create.items[].productId` |
| items[].orderedQty | number ≥ 1 | | `purchaseOrders.create.items[].orderedQty` |
| items[].unitCostRM | decimal | > 0 | `purchaseOrders.create.items[].unitCost` (×100 → cents via `rmToCents`) |

---

## 5. Tests

**Test files:**
- `apps/web/src/__tests__/routes/purchase-orders.test.tsx` — frontend tests
- `apps/server/src/tests/unit/services/purchase-orders.test.ts` — service unit tests
- `apps/server/src/tests/integration/purchase-orders.integration.test.ts` — integration tests

**Scenarios covered:** Create, approve, cancel, receiveItems flows; permission guards; list rendering.

**Not tested (risk areas):**
- Supplier Invoices tab, RecordInvoiceDialog, MatchReviewDialog, MarkPaidDialog — all new, no tests
- `statusFilter` in SupplierInvoicesTab is not included in the `queryKey` — changing the filter does not trigger a refetch automatically; `refetch()` is only called on mutation success, not on filter change
- Running total calculation uses `rmToCents(runningTotal)` where `runningTotal` is in RM (float); intermediate float rounding edge cases remain

---

## 6. Notes

- **Branch field** is now a `BranchSelector` component (dropdown of hierarchy nodes), replacing the old raw UUID text input — UX significantly improved.
- Supplier and branch columns in the PO table still display truncated UUIDs (first 8 chars + ellipsis) — no human-readable supplier name lookup is performed on the list view. The Invoices tab resolves supplier names via a separate `suppliers.list` query + `supplierMap`.
- `unitCost` is stored in integer cents; the UI accepts RM decimals and converts via `rmToCents()` from `apps/web/src/lib/money.ts`.
- `cancel` procedure requires `purchase_order_management:delete` permission — more restrictive than approve/receive which need `:update`.
- `receiveItems` marks the PO as `partially_received` if not all items are fully received, or `received` when complete — handled in service layer.
- `goodsReceipts.createInvoice` requires `purchase_order_management:create` permission — the "Invoice" button is only shown when `canCreate` is true.
- The `matchInvoice` → `disputeInvoice` flow: if `isWithinTolerance` is true, only the "Approve Match" button is shown; if false, only "Dispute Invoice" is shown. Disputed invoices can be re-reviewed (their status reverts to `disputed` not `cancelled`).
- `SupplierInvoicesTab` does not mount a `RecordInvoiceDialog` itself — invoice recording is triggered from the PO table tab, not the Invoices tab.
