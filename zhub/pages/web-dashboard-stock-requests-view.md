# Stock Requests

**Route:** `/dashboard/stock-requests/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/stock-requests/view.tsx:1`
**Platform:** web
**Auth required:** authenticated
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Lets inventory managers create, approve, reject, and fulfill stock requests between branches.
**Produces:** A status-filtered table of stock requests with action buttons per status and a sheet form to create new requests.
**On success:** Toast notification and cache invalidated.
**On failure / error states:** Spinner while loading; "Select an organization" prompt; toast errors on mutation failure; client-side validation on create form.

---

## 2. How It Works

**Execution flow:**
```
StockRequestsViewPage
  → useUserContext() → organizationId, hasPermission
  → useQuery(["hierarchyNodes", organizationId]) → client.hierarchy.listNodes (for branch combobox)
  → useQuery(["stockRequests", organizationId, statusFilter])
      → client.stockRequests.list({ organizationId, status })
  → columns: requestNumber (CopyableCell), dateIssued, issuedByMemberId, toBranchId, status (StatusBadge), actions
  → Actions by status:
      pending → Approve (approveMutation) | Reject (rejectMutation)
      approved → Fulfill button → openFulfillDialog()
          → client.stockRequests.getById (fetch items)
          → Dialog with per-item quantity inputs
          → fulfillMutation → client.stockRequests.fulfill(...)
  → Sheet (create form):
      → BranchCombobox (filtered from hierarchyNodes, type="branch")
      → createMutation → client.stockRequests.create(...)
```

**Inputs:** Status filter tab (All / Pending / Approved / Rejected / Fulfilled). Create form: toBranchId (required), fromBranchId (optional), destinationLabel, notes, productId (UUID, required), quantity (integer ≥1), itemNotes.
**State management:** `useState` for status filter, create sheet open state, form fields, fulfill dialog target and quantities, fetching indicator.
**Outputs:** Table render; Sheet for create; Dialog for fulfill with editable quantity per item.
**Side effects:** All mutations invalidate `["stockRequests", organizationId]`.

---

## 3. What Depends On It

**Calls these API endpoints:**
- `stockRequests.list` — filtered list
- `stockRequests.create` — new request with items
- `stockRequests.approve` — approve pending request
- `stockRequests.reject` — reject pending request
- `stockRequests.getById` — fetch items when opening fulfill dialog
- `stockRequests.fulfill` — fulfill approved request with per-item quantities
- `hierarchy.listNodes` — fetch branch nodes for combobox

**Uses these components:**
- `DataTable` — `apps/web/src/components/tables/sales/view/data-table.tsx` — generic table
- `CopyableCell` — `apps/web/src/components/tables/copyable-cell.tsx` — copy-on-click cell
- `Sheet`, `Dialog` — `@/components/ui/sheet`, `@/components/ui/dialog` — create/fulfill overlays
- `BranchCombobox` — inline component (not extracted) — searchable dropdown over hierarchy branch nodes

**Uses these hooks:**
- `useUserContext` — `currentOrganizationId`, `hasPermission`, `user.id`
- `useQuery`, `useMutation`, `useQueryClient`
- `useState`, `useRef`

**Navigation: who navigates here:**
- App sidebar → Inventory section → "Stock Requests" link

**Navigation: where it goes:** Stays on this page.

---

## 4. Data Shapes

**DB tables touched:**

| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `stock_requests` | SELECT | `id`, `requestNumber`, `status`, `toBranchId`, `fromBranchId`, `destinationLabel`, `dateIssued`, `issuedByMemberId`, `notes`, `createdAt` |
| `stock_requests` | INSERT | all above fields |
| `stock_requests` | UPDATE | `status` (approve/reject/fulfill) |
| `stock_request_items` | SELECT | `id`, `productId`, `quantityRequested`, `quantityFulfilled`, `notes` |
| `stock_request_items` | UPDATE | `quantityFulfilled` (on fulfill) |
| `hierarchy_nodes` | SELECT | `id`, `name`, `type` (filtered to `type="branch"`) |

**Key types:**
```ts
type StockRequestStatus = "pending" | "approved" | "rejected" | "fulfilled";
```

---

## 5. Tests

**Test files:** `apps/web/src/__tests__/routes/stock-requests.test.tsx`

**Scenarios covered:**
- Renders without crashing (empty state, heading visible)
- `client.stockRequests.list` called on mount
- Request number displayed in table
- Pending status badge shown for pending requests

**Not tested:** Create form, approve/reject actions, fulfill dialog, branch combobox, permission-gated UI, error states.

---

## 6. Notes

- `hasPermission("inventory_management:create")` gates the "New Request" button; `hasPermission("inventory_management:update")` gates action buttons in each row.
- The create form only supports a single item; adding multiple items requires separate requests.
- Product is entered as a raw UUID in the create form — no product picker is implemented.
- The fulfill dialog fetches fresh item data via `getById` each time it opens (not from list data, which omits items).
- `BranchCombobox` is defined inline within the page component, not in a shared file.
