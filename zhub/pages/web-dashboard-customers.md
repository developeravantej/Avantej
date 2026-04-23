# Registered Customers

**Route:** `/dashboard/customers/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/customers/view.tsx`
**Platform:** web
**Auth required:** authenticated + rbac(customer_management:read)
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Browse and manage registered customers in the organization, with search, branch filtering, and per-customer detail view.

**Produces:** A paginated customer directory table showing name, email, phone, active packages, lifetime value (LTV), and outstanding balance; detail sheet on click.

**On success:** Table populates with customer rows; pagination enabled if total > 50.

**On failure / error states:** 
- No org selected: guard message "Select an organization..."
- Permission denied: 403 guard page
- Loading: spinner
- Error: "Failed to load customers. Please try again."
- Empty: "No customers found" with contextual message

---

## 2. How It Works

**Execution flow:**  
1. `RegisteredCustomersPage` reads org from `useUserContext`
2. Checks `customer_management:read` permission; blocks if denied
3. Query `client.customerDirectory.list()` with search, branchId, offset
4. Maps API rows → `CustomerDirectoryRow[]`
5. Renders table with columns: customer (avatar + name/email), phone, packages (badge), LTV, outstanding, actions
6. Click Edit → opens `CustomerDetailSheet` with `memberId`
7. Click View 360° → routes to `/dashboard/customers/$id`

**Inputs:**  
- URL query param `customerId` (optional) → pre-opens detail sheet
- Search input (debounced 300ms)
- Branch dropdown (if accessible branches exist)
- Pagination: offset increments by PAGE_LIMIT (50)

**State management:**  
- TanStack Query: `["customerDirectory", organizationId, debouncedSearch, branchId, offset]`
- Local state: search, branchId, offset, selectedMemberId, sheetOpen
- Hierarchy: reads from `userContext.currentOrg.hierarchy`

**Outputs:**  
- Table rows with interactive links
- Detail sheet overlay on member ID select
- Route navigation to 360° view

**Side effects:**  
- Query invalidation on detail sheet save (via `CustomerDetailSheet` callback)
- Toast on permission error or API failure

---

## 3. What Depends On It

**Calls these API endpoints:**  
- `client.customerDirectory.list({ organizationId, search?, branchId?, limit, offset })` — fetch paginated customer rows  
- (via `CustomerDetailSheet`) customer update mutations

**Uses these components:**  
- `CustomerDetailSheet` — `src/components/customers/customer-detail-sheet.tsx` — edit customer profile  
- `DataTable` (not used here; manual table) — pagination + display
- `CopyableCell` — clickable phone number copy
- Badge, Button, Input, Select (shadcn/ui)

**Uses these hooks:**  
- `useUserContext()` — org ID, permissions, hierarchy
- `useQuery()` — fetch customers
- `useDebounce()` — search input

**Navigation: who navigates here:**  
- Dashboard sidebar link
- With `?customerId=<id>` param to pre-open detail sheet

**Navigation: where it goes:**  
- `/dashboard/customers/$id` (View 360° link)
- Detail sheet on member edit

---

## 4. Data Shapes

**DB tables touched:**  
- `members` (read) — user profile  
- `customers` / `memberships` (read) — LTV, packages, outstanding  
- `hierarchies` (read) — branch filter options

**Key types / Zod schemas:**  
```tsx
type CustomerDirectoryRow = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  hierarchyScopeId: string;
  branchName: string | null;
  activePackageCount: number;
  lifetimeValueCents: number;
  outstandingBalanceCents: number;
  appointmentCount: number;
  lastVisitAt: Date | string | null;
  createdAt: Date | string;
};

// API response
{ rows: CustomerDirectoryRow[], total: number }
```

---

## 5. Tests

**Test files:** `src/__tests__/routes/dashboard.test.tsx` (may include this route)

**Scenarios covered:** (verify via test file)

**Not tested (risk areas):**  
- Hierarchy-based branch filtering logic  
- Permission re-check when org changes  
- Pagination edge cases (offset > total)  
- Search + branch + pagination interaction

---

## 6. Notes

- **Hierarchy access**: Uses `currentOrg.hierarchy.member.accessibleNodeIds` to filter branches; non-branch hierarchies fall back to all accessible nodes.
- **Export button**: Disabled with tooltip "Export is not available yet."
- **Phone handling**: Displays "—" if null; uses `CopyableCell` for click-to-copy.
- **Initials avatar**: Computed from first two name parts.
- **Outstanding balance**: Highlighted in red if > 0; muted if zero.
- **Detail sheet callback**: `onSaved={() => {}}` does nothing; queries will refetch on success inside `CustomerDetailSheet`.

