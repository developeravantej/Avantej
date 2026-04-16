# Purchase Orders View

**Route:** `/dashboard/purchase-orders/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Manage supplier purchase orders — create draft POs, approve them, record received inventory, and cancel orders that are no longer needed.
**Produces:** A table of purchase orders with PO number, supplier, branch, dates, total (MYR), status, and contextual action buttons; plus a "Create PO" sheet and a "Receive Items" sheet.
**On success:**
- Create: "Purchase order created successfully.", table refreshes.
- Approve: "Purchase order approved.", table refreshes.
- Receive: "Items received successfully.", table refreshes.
- Cancel: "Purchase order cancelled.", table refreshes.
**On failure / error states:**
- Loading: centered spinner.
- API errors: toast with error message.
- No organization: loading is suppressed (query disabled), table renders empty.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext() → organizationId, hasPermission()
  → canCreate = hasPermission("purchase_order_management:create")
  → canUpdate = hasPermission("purchase_order_management:update")
  → useQuery(["purchaseOrders", organizationId])
      → client.purchaseOrders.list({ organizationId })
        → purchaseOrdersRouter.list → requirePermission("purchase_order_management", "read")
        → listPurchaseOrders(tenantDb, { accessibleNodeIds, ... })

  [Create Sheet]
  → also queries: client.suppliers.list, client.products.list (when sheet open)
  → createMutation → client.purchaseOrders.create(...)
      → requirePermission("purchase_order_management", "create")
      → createPurchaseOrder(tenantDb, { supplierId, branchId, orderDate, items })

  [Row Actions]
  → approveMutation → client.purchaseOrders.approve({ organizationId, id })
      → requirePermission("purchase_order_management", "update")
      → approvePurchaseOrder(tenantDb, id, member.userId)

  → cancelMutation → client.purchaseOrders.cancel({ organizationId, id })
      → requirePermission("purchase_order_management", "delete")
      → cancelPurchaseOrder(tenantDb, id)

  [Receive Items Sheet]
  → client.purchaseOrders.getById({ organizationId, id }) + client.products.list
  → receiveMutation → client.purchaseOrders.receiveItems({ organizationId, purchaseOrderId, items })
      → requirePermission("purchase_order_management", "update")
      → receiveItems(tenantDb, purchaseOrderId, items)
```

**Inputs (create form):** Supplier (select from list), Branch ID (UUID text input), Order Date (date), Expected Delivery (date, optional), Notes, Line Items (product select + qty + unit cost in RM).
**Inputs (receive form):** Quantity received per line item (capped at remaining quantity).
**State management:**
- `createSheetOpen`, `receivePoId` — sheet visibility.
- TanStack Query cache keyed on `["purchaseOrders", organizationId]`.
**Outputs:** Table columns: PO # (copyable), Supplier (truncated UUID), Branch (truncated UUID), Order Date, Expected Delivery, Total (MYR), Status (badge), Actions.
**Side effects:** All mutations call `qc.invalidateQueries({ queryKey: ["purchaseOrders", organizationId] })`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `purchaseOrders.list` — list all POs; requires `purchase_order_management:read`.
- `purchaseOrders.getById` — load PO detail for receive sheet; requires `purchase_order_management:read`.
- `purchaseOrders.create` — create draft PO; requires `purchase_order_management:create`.
- `purchaseOrders.approve` — move draft → approved; requires `purchase_order_management:update`.
- `purchaseOrders.receiveItems` — record received quantities; requires `purchase_order_management:update`.
- `purchaseOrders.cancel` — cancel draft or approved PO; requires `purchase_order_management:delete`.
- `suppliers.list` — populate supplier select in create sheet.
- `products.list` — populate product select in create and receive sheets.

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table.
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — copyable PO number.
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` — `apps/web/src/components/ui/sheet.tsx`.
- `StatusBadge` — inline component mapping PO status to badge variant.
- UI primitives: `Button`, `Badge`, `Input`, `Label`, `Textarea`, `Select`, `Separator`.

**Uses these hooks:**
- `useUserContext` — provides `currentOrganizationId` and `hasPermission`.
- `useQuery`, `useMutation`, `useQueryClient`, `useCallback`, `useMemo` (React + TanStack Query).

**Navigation: who navigates here:** Sidebar "Sales & Inventory → Sales → Purchase Orders" link (`apps/web/src/components/app-sidebar.tsx:160`).
**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `purchase_orders` | SELECT / INSERT / UPDATE | `id`, `purchaseOrderNumber`, `supplierId`, `branchId`, `orderDate`, `expectedDeliveryDate`, `totalAmount`, `status`, `notes`, `createdAt` |
| `purchase_order_items` | SELECT / INSERT / UPDATE | `id`, `purchaseOrderId`, `productId`, `orderedQty`, `receivedQty`, `unitCost` |
| `suppliers` | SELECT | `id`, `name` |
| `products` | SELECT | `id`, `name`, `sku` |

**Key types:**
```typescript
type PurchaseOrderRow = {
  id: string; purchaseOrderNumber: string;
  supplierId: string; branchId: string;
  orderDate: Date | string | null;
  expectedDeliveryDate: Date | string | null | undefined;
  totalAmount: number; // cents
  status: string; // "draft"|"approved"|"ordered"|"partially_received"|"received"|"cancelled"
  notes: string | null | undefined; createdAt: Date | string | null;
};
// Line item in create form: { productId, orderedQty (int), unitCost (cents) }
```

---

## 5. Tests

**Test files:**
- `apps/server/src/tests/unit/services/purchase-orders.test.ts` — service-layer unit tests.
- `apps/server/src/tests/integration/purchase-orders.integration.test.ts` — integration tests.

**Scenarios covered:** `listPurchaseOrders`, `getPurchaseOrderById`, `createPurchaseOrder`, `approvePurchaseOrder`, `receiveItems`, `cancelPurchaseOrder` at service layer.
**Not tested:** Frontend create form validation, line item running total calculation, receive quantity capping, permission-gating of action buttons.

---

## 6. Notes

- Action button visibility is status-driven: Approve (draft only), Receive (approved/ordered/partially_received), Cancel (draft/approved). Buttons are also gated by `canUpdate`.
- Branch ID in the create form is a raw UUID text input — there is no branch picker UI; the user must know the UUID.
- Unit cost is entered in RM by the user and multiplied by 100 before submission: `unitCost = Math.round(parseFloat(unitCostRM) * 100)`.
- Running total in the create sheet is calculated client-side in RM (`qty * costRM`), then passed to `formatPrice` after multiplying by 100.
- Supplier and product data for the create sheet are fetched lazily (only when `open === true`).
- `accessibleNodeIds` is passed from context to `listPurchaseOrders` — staff see only POs in their scope.
