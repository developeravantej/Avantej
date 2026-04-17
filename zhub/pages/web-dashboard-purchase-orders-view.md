# Purchase Orders View

**Route:** `/dashboard/purchase-orders/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx:1`
**Platform:** web
**Auth required:** authenticated (rbac `purchase_order_management:read`; create: `:create`; approve/receive: `:update`; cancel: `:delete`)
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Create and manage purchase orders sent to suppliers — draft orders, approve them, record received inventory, and cancel orders when needed.

**Produces:** A data table of all purchase orders with status badges and contextual action buttons; a "New PO" Sheet for creating draft orders with line items; a "Receive Items" Sheet for recording received quantities.

**On success:** Created PO appears in the list as "Draft"; approved PO moves to "Approved" status; received items update `receivedQty` and move PO to `partially_received` or `received`; cancelled PO shows "Cancelled" badge.

**On failure / error states:** Spinner while loading; toast errors on mutation failures (create, approve, cancel, receive).

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext()                              # reads organizationId + hasPermission()
  → useQuery(["purchaseOrders", orgId])
    → client.purchaseOrders.list({ organizationId })
      → purchaseOrdersRouter.list                # rbac: purchase_order_management:read
        → listPurchaseOrders()                   # service fn + accessibleNodeIds filter
          → purchase_orders (tenant DB)
  → approveMutation
    → client.purchaseOrders.approve({ organizationId, id })
      → approvePurchaseOrder()                   # sets status='approved'
  → cancelMutation
    → client.purchaseOrders.cancel({ organizationId, id })
      → cancelPurchaseOrder()                    # sets status='cancelled'

CreatePOSheet (sub-component):
  → useQuery(["suppliers", orgId])  → client.suppliers.list(...)
  → useQuery(["products", orgId])   → client.products.list(...)
  → createMutation
    → client.purchaseOrders.create(...)
      → createPurchaseOrder()                    # inserts PO + line items

ReceiveItemsSheet (sub-component):
  → useQuery(["purchaseOrders", orgId, poId])
    → client.purchaseOrders.getById({ organizationId, id })
  → useQuery(["products", orgId])  → client.products.list(...)
  → receiveMutation
    → client.purchaseOrders.receiveItems(...)
      → receiveItems()                           # updates receivedQty per item
```

**Inputs (Create Sheet):**
- Supplier (select from `suppliers.list`)
- Branch ID (UUID text input)
- Order date (date, required)
- Expected delivery date (date, optional)
- Notes (textarea, optional)
- Line items: product (select), qty (number ≥ 1), unit cost in RM (decimal)

**Inputs (Receive Items Sheet):**
- Per-item: received quantity (number, 0 to remaining)

**State management:**
- `createSheetOpen` — Create PO Sheet visibility
- `receivePoId` — which PO's Receive Sheet is open (null = closed)
- `canCreate`, `canUpdate` — permission guards derived from `hasPermission()`

**Outputs:** `DataTable<PurchaseOrderRow>`; inline action buttons (Approve, Receive, Cancel) per row based on status.

**Side effects:** `queryClient.invalidateQueries(["purchaseOrders", orgId])` after all mutations.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `purchaseOrders.list` — list all POs for org
- `purchaseOrders.create` — create draft PO with line items
- `purchaseOrders.approve` — approve a draft PO
- `purchaseOrders.cancel` — cancel a draft or approved PO
- `purchaseOrders.getById` — load PO detail for Receive Sheet
- `purchaseOrders.receiveItems` — record received quantities
- `suppliers.list` — populate supplier dropdown in Create Sheet
- `products.list` — populate product dropdown in Create/Receive Sheets

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — reused generic table
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — PO number cell
- `StatusBadge` (local) — maps `draft|approved|ordered|partially_received|received|cancelled` to badge variants
- `CreatePOSheet` (local sub-component) — Sheet for new PO creation
- `ReceiveItemsSheet` (local sub-component) — Sheet for recording receipts

**Uses these hooks:**
- `useUserContext` — provides `organizationId` and `hasPermission()`

**Navigation: who navigates here:** `apps/web/src/components/app-sidebar.tsx` — "Purchase Orders" link under the Sales nav group

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `purchase_orders` (tenant) | READ, INSERT, UPDATE | `id`, `purchaseOrderNumber`, `supplierId`, `branchId`, `orderDate`, `expectedDeliveryDate`, `totalAmount`, `status`, `notes`, `createdAt` |
| `purchase_order_items` (tenant) | READ, INSERT, UPDATE | `id`, `purchaseOrderId`, `productId`, `orderedQty`, `receivedQty`, `unitCost` |

**Key types:**
```typescript
type PurchaseOrderRow = {
  id: string; purchaseOrderNumber: string; supplierId: string; branchId: string;
  orderDate: Date|string|null; expectedDeliveryDate: Date|string|null|undefined;
  totalAmount: number;   // cents
  status: string;        // "draft"|"approved"|"ordered"|"partially_received"|"received"|"cancelled"
  notes: string|null|undefined; createdAt: Date|string|null;
}

type LineItem = {
  key: string; productId: string; orderedQty: string; unitCostRM: string;
}
```

**Create form fields:**
| Field | Type | Validation | Maps to |
|-------|------|------------|---------|
| supplierId | select | required | `purchaseOrders.create.supplierId` |
| branchId | text (UUID) | required, trimmed | `purchaseOrders.create.branchId` |
| orderDate | date | required | `purchaseOrders.create.orderDate` (→ ISO datetime) |
| expectedDelivery | date | optional | `purchaseOrders.create.expectedDeliveryDate` |
| notes | textarea | optional | `purchaseOrders.create.notes` |
| items[].productId | select | at least 1 valid item | `purchaseOrders.create.items[].productId` |
| items[].orderedQty | number ≥ 1 | | `purchaseOrders.create.items[].orderedQty` |
| items[].unitCostRM | decimal | > 0 | `purchaseOrders.create.items[].unitCost` (×100 → cents) |

---

## 5. Tests

**Test files:**
- `apps/web/src/__tests__/routes/purchase-orders.test.tsx` — frontend tests
- `apps/server/src/tests/unit/services/purchase-orders.test.ts` — service unit tests
- `apps/server/src/tests/integration/purchase-orders.integration.test.ts` — integration tests

**Scenarios covered:** Create, approve, cancel, receiveItems flows; permission guards; list rendering.

**Not tested (risk areas):**
- Branch ID field accepts any string — no UUID validation client-side before submission
- Running total in Create Sheet uses `runningTotal * 100` for `formatPrice` but calculates in RM; intermediate float rounding edge cases
- Supplier column in table shows truncated UUID (first 8 chars) rather than supplier name — requires separate lookup

---

## 6. Notes

- `branchId` in the Create Sheet is a raw UUID text input — the UX is poor (should be a select); users must know the branch UUID.
- Supplier and branch columns in the main table display truncated UUIDs (first 8 chars + ellipsis), not human-readable names. A separate supplier name lookup is not performed on the list view.
- `unitCost` is stored in integer cents; the UI accepts RM decimals and multiplies by 100 (`Math.round(parseFloat(l.unitCostRM) * 100)`).
- Action button visibility is status-driven: Approve (draft only), Receive (approved/ordered/partially_received), Cancel (draft/approved only).
- The `cancel` procedure requires `purchase_order_management:delete` permission — more restrictive than approve/receive which need `:update`.
- `receiveItems` marks the PO as `partially_received` if not all items are fully received, or `received` when complete — this transition is handled in the service layer.
