# Stock Requests & Transfer Orders

**Route:** `/dashboard/stock-requests/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/stock-requests/view.tsx`
**Platform:** web
**Auth required:** authenticated + `inventory_management` permission
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Manage stock requests and transfer orders between branches/locations. Two tabs: Requests (pending/approved/rejected/fulfilled) and Transfers (pending/in-transit/completed/cancelled).
**Produces:** Tabbed interface with two data tables, each with CRUD operations for their respective order type.
**On success:** Request/transfer created/approved/rejected/fulfilled; table updates; toast shown.
**On failure / error states:** Loading spinner, error toasts.

---

## 2. How It Works

**Execution flow:**
1. Page loads with `?tab=requests` or `?tab=transfers` in search
2. Route component reads tab from search params
3. `ConsolidatedTabs` component renders two tab panes
4. Each pane is a separate component (`StockRequestsTabPage` or `TransferOrdersTabPage`)
5. Both tabs:
   - Fetch branches via `client.hierarchy.listNodes()`
   - Fetch their respective list via `client.stockRequests.list()` or `client.transferOrders.list()`
   - Render table with status filter (Pending/Approved/etc.)
   - Provide create button, status action buttons (approve/reject/fulfill/etc.)
6. User navigates tabs → URL search param updates (no page reload)

**Inputs:**
- Tab selection via URL: `tab=requests|transfers`
- Filter state: status (pending/approved/etc.)
- Form inputs: quantity, notes, branch selection

**State management:**
- TanStack Query: 
  - `["hierarchyNodes", organizationId]` — branches
  - `["stockRequests", organizationId]` or `["transferOrders", organizationId]` — data
- Local state per tab: `statusFilter`, `sheetOpen`, `editingId`, `form`, etc.

**Outputs:**
- Two tabs (tab bar at top, content below)
- DataTable in each tab with request/transfer rows
- Sheet for create/edit form
- Dialog for approve/reject/fulfill confirmation

**Side effects:**
- Query invalidation on mutation success
- Toast notifications on success/error
- URL param update on tab change

---

## 3. What Depends On It

**Calls these API endpoints:**
*Stock Requests tab:*
- `client.hierarchy.listNodes({ organizationId })` — get branches
- `client.stockRequests.list({ organizationId })` — fetch requests
- `client.stockRequests.create({ organizationId, ...fields })`
- `client.stockRequests.approve({ organizationId, id })`
- `client.stockRequests.reject({ organizationId, id })`
- `client.stockRequests.fulfill({ organizationId, id, items: [...] })`

*Transfer Orders tab:*
- `client.hierarchy.listNodes({ organizationId })` — get branches
- `client.transferOrders.list({ organizationId })` — fetch transfers
- `client.transferOrders.create({ organizationId, ...fields })`
- `client.transferOrders.receive({ organizationId, id, items: [...] })`
- `client.transferOrders.cancel({ organizationId, id })`

**Uses these components:**
- `ConsolidatedTabs` — tab container
- `DataTable` — render request/transfer list
- `Sheet` (sidebar) — create/edit form
- `Dialog` — approve/reject/fulfill/receive confirmation
- `Button`, `Input`, `Textarea`, `Select` — form controls
- `StatusBadge` — status indicator
- `CopyableCell` — request/transfer number (copyable)
- `lucide-react` icons (Plus, CheckCircle, XCircle, etc.)

**Uses these hooks:**
- `useUserContext()` — org ID, permission check
- `useQuery()` — fetch branches, requests, transfers
- `useMutation()` — create, approve, reject, fulfill, etc.
- `useState()` — filter, sheet, form state
- `Route.useSearch()`, `Route.useNavigate()` — tab management

**Navigation: who navigates here:** Dashboard sidebar
**Navigation: where it goes:** None (modal-based CRUD)

---

## 4. Data Shapes

**DB tables touched:** `stockRequests`, `transferOrders`, `hierarchyNodes`
**Key types / Zod schemas:**
```typescript
// Stock Request
type StockRequestStatus = "pending" | "approved" | "rejected" | "fulfilled";

interface StockRequestItem {
  id: string;
  productId: string;
  quantityRequested: number;
  quantityFulfilled?: number | null;
  notes?: string | null;
}

interface StockRequestRow {
  id: string;
  requestNumber: string;
  dateIssued: string;
  issuedByMemberId: string;
  fromBranchId?: string | null;
  toBranchId: string;
  destinationLabel?: string | null;
  notes?: string | null;
  status: StockRequestStatus;
  items: StockRequestItem[];
  createdAt: string;
}

// Transfer Order
type TransferOrderStatus = "pending" | "in_transit" | "completed" | "cancelled";

interface TransferOrderItem {
  id: string;
  productId: string;
  quantityTransferred: number;
  quantityReceived?: number | null;
  notes?: string | null;
}

interface TransferOrderRow {
  id: string;
  transferNumber: string;
  dateIssued: string;
  fromBranchId: string;
  toBranchId: string;
  issuedByMemberId: string;
  notes?: string | null;
  status: TransferOrderStatus;
  items: TransferOrderItem[];
  createdAt: string;
}

// Hierarchy Node
interface HierarchyNode {
  id: string;
  type: "branch" | "department" | ...;
  name: string;
  // ... other fields
}
```

---

## 5. Tests

**Test files:** `src/__tests__/routes/stock-requests.test.tsx`
**Scenarios covered:**
- Renders without crashing (empty state)
- Calls `client.stockRequests.list` on mount
- Shows stock request data in table
- Displays request number (e.g., "SR-001")

**Not tested (risk areas):**
- Tab switching (URL param updates)
- Permission checks (`inventory_management:create`, `:update`)
- Mutation success/error flows
- Form validation
- Transfer orders tab (transfer-orders.test.tsx may exist separately)

---

## 6. Notes

**Tab routing:** The view page only renders `ConsolidatedTabs`; both panes are imported as separate tab components. Each has its own logic, state, and API calls. The tab param is managed via URL search, not local state.

**Branches list:** Both tabs fetch and cache branches separately. Consider sharing this via context or a higher-level query to avoid duplicate API calls per tab.

**Permission checks:** Lines 83–84 read `hasPermission("inventory_management:create")` and `:update`. Buttons are disabled based on these flags. No RBAC-gated navigation (both tabs render regardless).

**Status filter:** Each tab has a status filter UI (not shown in this excerpt, but visible in the component). Filtering is local; no query param.

**Copyable cell:** Request/transfer numbers use a `CopyableCell` component for easy clipboard copy (imported line 27).

**Items table:** Request/transfer items are shown in a nested or detail view (not in main table; details depend on modal implementation).

**Brand colors:** Forms use brand-primary-1 and brand-secondary-1 for theming; this aligns with the org's design system.

**Hierarchy filtering:** Branches are filtered from the hierarchy nodes (line 96 in requests-tab: `.filter((n) => n.type === "branch")`), allowing for future expansion to other node types.
