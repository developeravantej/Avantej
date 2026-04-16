# Transfer Orders

**Route:** `/dashboard/transfer-orders/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/transfer-orders/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lets inventory managers create and manage inventory transfer orders between branches, progressing them through a pending → in-transit → completed lifecycle (or cancelling).
**Produces:** A status-filtered table of transfer orders with lifecycle action buttons, a creation sheet, a completion dialog, and a cancellation confirmation dialog.
**On success:** Toast notification and cache invalidated.
**On failure / error states:** Spinner while loading; "Select an organization" prompt; toast errors on mutation failure; client-side form validation.

---

## 2. How It Works

**Execution flow:**
```
TransferOrdersViewPage
  → useUserContext() → organizationId, hasPermission
  → useQuery(["hierarchyNodes", organizationId]) → client.hierarchy.listNodes (branch combobox)
  → useQuery(["transferOrders", organizationId, statusFilter])
      → client.transferOrders.list({ organizationId, status })
  → columns: transferNumber, dateIssued, fromBranchId, toBranchId, status, actions
  → Actions by status:
      pending  → "Mark In Transit" (markInTransitMutation) | "Cancel" (→ cancelTarget Dialog)
      in_transit → "Complete" (→ openCompleteDialog)
                    → client.transferOrders.getById (fetch items)
                    → Dialog with per-item received quantity inputs
                    → completeMutation → client.transferOrders.complete(...)
                 | "Cancel" (→ cancelTarget Dialog)
  → cancelMutation → client.transferOrders.cancel(...)
  → Sheet (create):
      → BranchCombobox for fromBranchId (required) + toBranchId (required)
      → createMutation → client.transferOrders.create(...)
```

**Inputs:** Status filter tabs (All / Pending / In Transit / Completed / Cancelled). Create form: fromBranchId (required), toBranchId (required), notes, productId (UUID, required), quantity (integer ≥1), itemNotes.
**State management:** `useState` for statusFilter, create sheet, form fields, completeTarget + receiveQuantities, cancelTarget, fetching flag.
**Outputs:** Table; Sheet for create; Dialog for complete (with per-item quantity); Dialog for cancel confirmation.
**Side effects:** All mutations invalidate `["transferOrders", organizationId]`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `transferOrders.list` — filtered by status
- `transferOrders.create` — new transfer with items
- `transferOrders.markInTransit` — pending → in_transit
- `transferOrders.getById` — fetch items when opening complete dialog
- `transferOrders.complete` — in_transit → completed, records received quantities
- `transferOrders.cancel` — pending or in_transit → cancelled
- `hierarchy.listNodes` — branch nodes for combobox

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — copy transfer number
- `Sheet` — `@/components/ui/sheet` — create form
- `Dialog` — `@/components/ui/dialog` — complete + cancel dialogs
- `BranchCombobox` — inline component — searchable dropdown over branch nodes

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`, `hasPermission`, `user.id`
- `useQuery`, `useMutation`, `useQueryClient`
- `useState`, `useRef`

**Navigation: who navigates here:**
- App sidebar → Inventory section → "Transfer Orders" link

**Navigation: where it goes:** Stays on this page.

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `transfer_orders` | SELECT | `id`, `transferNumber`, `status`, `fromBranchId`, `toBranchId`, `dateIssued`, `issuedByMemberId`, `notes`, `createdAt` |
| `transfer_orders` | INSERT | all above fields |
| `transfer_orders` | UPDATE | `status` (markInTransit / complete / cancel) |
| `transfer_order_items` | SELECT | `id`, `productId`, `quantityTransferred`, `quantityReceived`, `notes` |
| `transfer_order_items` | UPDATE | `quantityReceived` (on complete) |
| `hierarchy_nodes` | SELECT | `id`, `name`, `type` (filtered to `type="branch"`) |

**Key types:**
```ts
type TransferOrderStatus = "pending" | "in_transit" | "completed" | "cancelled";
```

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/transfer-orders.test.tsx`

**Scenarios covered:**
- Renders without crashing (heading visible)
- `client.transferOrders.list` called on mount
- Transfer number displayed in table
- "New Transfer" button visible

**Not tested:** Create form, lifecycle actions (markInTransit, complete, cancel), complete dialog, cancel dialog, permission-gated UI, error states.

---

## 6. Notes

- `hasPermission("inventory_management:create")` gates the "New Transfer" button; `hasPermission("inventory_management:update")` gates action buttons per row.
- The create form supports only one item per transfer order.
- Product ID is entered as a raw UUID — no product picker.
- The completion dialog fetches fresh items via `getById` each time it opens (list data omits items for performance).
- `BranchCombobox` is defined inline within the page component (same pattern as stock-requests).
- Cancel is available for both `pending` and `in_transit` orders; a confirmation dialog is shown before the mutation fires.
