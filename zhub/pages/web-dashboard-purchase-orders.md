# Purchase Orders

**Route:** `/dashboard/purchase-orders/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx`
**Platform:** web
**Auth required:** authenticated + rbac(purchase_order_management:read)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** View, create, approve, and receive purchase orders from suppliers.

**Produces:** Table of purchase orders with status badges, expandable sheets for creation and receiving items.

**On success:** 
- New PO created (draft state, toast confirmation)
- PO approved (status updated to approved)
- Items received (status updated, quantities tracked)

**On failure / error states:**
- Loading spinner during fetch
- Empty state: "No purchase orders found" with button to create
- Error card with retry button
- Toast errors for failed mutations

---

## 2. How It Works

**Execution flow:**
1. Route loads, fetches list of POs via `client.purchaseOrders.list()`
2. Data mapped to `PurchaseOrderRow[]` with status mapping (draft, approved, ordered, partially_received, received, cancelled)
3. Table columns include PO#, supplier, branch, dates, total, status, and action buttons
4. CreatePOSheet can be opened via "New PO" button
   - Queries suppliers and products when sheet opens
   - User selects supplier, branch, dates, adds line items
   - On submit: `client.purchaseOrders.create()` with items (qty, cost in cents)
5. ReceiveItemsSheet opened per-PO
   - Fetches PO detail + products
   - User enters received quantities for each item
   - On submit: `client.purchaseOrders.receiveItems()`
6. Approval: `client.purchaseOrders.approve()` (draft → approved)
7. Cancellation: `client.purchaseOrders.cancel()` (draft or approved → cancelled)

**Inputs:**
- URL: none (list view)
- Form inputs: supplier, branch, order date, expected delivery, notes, line items
- Receive form: quantities per item

**State management:**
- TanStack Query: `["purchaseOrders", organizationId]`
- Local state: create sheet open, receive sheet poId, form data
- Cache invalidation on create/approve/cancel/receive

**Outputs:**
- Table renders all POs with status badges
- Buttons disabled based on status and permission (purchase_order_management:update)
- Toast notifications on success/failure

**Side effects:**
- Creates, approves, cancels, receives POs
- Invalidates PO query cache
- Toast feedback
- No navigation (stays on page)

---

## 3. What Depends On It

**Calls these API endpoints:**
- `client.purchaseOrders.list()` — fetch all POs for org
- `client.purchaseOrders.create()` — create draft PO
- `client.purchaseOrders.approve()` — transition to approved
- `client.purchaseOrders.cancel()` — cancel draft/approved
- `client.purchaseOrders.receiveItems()` — record item receipts
- `client.purchaseOrders.getById()` — fetch PO detail for receive sheet
- `client.suppliers.list()` — populate supplier dropdown
- `client.products.list()` — populate product dropdown in line items

**Uses these components:**
- `DataTable` from `@/components/tables/sales/view/data-table` — renders PO table
- `StatusBadge` from `@/components/ui/status-badge` — status display (mapped via PO_STATUS_MAP)
- `CopyableCell` — PO number cell
- `BranchSelector` — branch selection in create sheet
- Sheet, Button, Input, Select, Textarea — shadcn/ui

**Uses these hooks:**
- `useUserContext()` — org ID, permission checks (purchase_order_management:create, :update)
- `useQuery` (React Query) — data fetching
- `useMutation` (React Query) — create, approve, cancel, receive mutations
- `useQueryClient()` — cache invalidation

**Navigation: who navigates here:** 
- Sidebar link (dashboard menu)
- Direct URL

**Navigation: where it goes:**
- None (self-contained list + modals)

---

## 4. Data Shapes

**DB tables touched:**
- `purchaseOrders` (select, insert, update)
- `purchaseOrderItems` (insert, update)
- `suppliers` (select)
- `products` (select)

**Key types / Zod schemas:**
```typescript
type PurchaseOrderRow = {
  id: string;
  purchaseOrderNumber: string;
  supplierId: string;
  branchId: string;
  orderDate: Date | string | null;
  expectedDeliveryDate: Date | string | null;
  totalAmount: number; // in cents or RM?
  status: string; // "draft" | "approved" | "ordered" | "partially_received" | "received" | "cancelled"
  notes: string | null;
  createdAt: Date | string | null;
};

type LineItem = {
  key: string; // uuid
  productId: string;
  orderedQty: string;
  unitCostRM: string; // user input in RM, converted to cents on submit
};

// API input (create)
{
  organizationId: string;
  supplierId: string;
  branchId: string;
  orderDate: string; // ISO datetime
  expectedDeliveryDate?: string;
  notes?: string;
  items: { productId: string; orderedQty: number; unitCost: number }[]; // unitCost in cents
}

// API input (receiveItems)
{
  organizationId: string;
  purchaseOrderId: string;
  items: { itemId: string; receivedQty: number }[];
}
```

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/purchase-orders.test.tsx`

**Scenarios covered:**
- Empty state rendering
- "New PO" button visibility
- PO table rendering with data
- Draft PO shows Approve and Cancel buttons
- (More tests likely exist; file was truncated)

**Not tested (risk areas):**
- Line item addition/removal/editing in form
- Currency conversion (RM to cents)
- Promo/tax recalculation on cart changes
- Receipt dialog and print functionality
- Edge cases: missing branch, invalid dates

---

## 6. Notes

- **Price storage:** `unitCostRM` entered by user in Malaysian Ringgit, converted to cents on submit (`Math.round(parseFloat(l.unitCostRM) * 100)`). API expects `unitCost` in cents.
- **Status mapping:** PO statuses are domain-specific (draft, approved, ordered, partially_received, received, cancelled); mapped to canonical StatusBadge equivalents for UI.
- **Branch locking:** Once a customer is selected, branch is inferred and locked (no re-selection per item).
- **Dates:** Form uses HTML `type="date"`, converted to ISO datetime on submit.
- **Permissions:** Create requires `purchase_order_management:create`; approve/cancel/receive requires `:update`.
- **RBAC in action buttons:** Visibility of Approve/Receive/Cancel buttons tied to permission and status.
