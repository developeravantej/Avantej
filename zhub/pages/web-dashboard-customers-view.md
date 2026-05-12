# Customer Directory

**Route:** `/dashboard/customers/view`
**File:** `apps/web/src/routes/_authenticated/dashboard/_layout/customers/view.tsx:1`
**Platform:** web
**Auth required:** authenticated + `customer_management:read`
**Last updated:** 2026-04-21

---

## 1. What It Does

**Purpose (user perspective):** Registered-customer list with lifetime value, active package count, outstanding balance, and last-visit date. Row click opens a drawer with profile edit + packages + recent payments + stats. The page renders `RegisteredCustomersPage` directly — no tabs, no Walk-in tab.

**Produces:** Paginated `DataTable` (8 columns: Name w/ avatar, Phone, Email, Active Pkgs, LTV, Outstanding, Last Visit, Joined) + server-side search (debounced 300ms) + branch combobox filter (RBAC-scoped to `accessibleNodeIds`).

**On failure:** 403 error guard if user lacks `customer_management:read`; table shows skeleton while loading.

---

## 2. How It Works

**Execution flow:**
```
RouteComponent
  → useUserContext()                    # organizationId, hasPermission, accessibleNodeIds
  → useQuery(["customerDirectory", filters])
    → client.customerDirectory.list({ organizationId, query, branchId, limit, offset })
      → customerDirectoryRouter.list    # rbac: customer_management:read
        → listCustomerDirectory()       # service fn
          → members (tenant, role='client') + customer_profiles LEFT JOIN + package_instances aggregate (FILTER)
          → payments aggregate via sales_orders.customerId
          → cross-DB inArray batch against control-panel user table (name, email)
```

**Row click:** opens `CustomerDetailSheet` (right Sheet) with `getById` query for full details.

**State:** TanStack Query cache + `useState` for filter/search + drawer open state.

---

## 3. What Depends On It

**API endpoints:**
- `customerDirectory.list` — paginated + filtered
- `customerDirectory.getById` — single record with packages, payments, stats
- `customerProfiles.upsertForCustomer` — admin-scoped profile edit (drawer save)

**Components:**
- `CustomerDetailSheet` — `apps/web/src/components/customers/customer-detail-sheet.tsx` — 4 collapsible sections (Profile editable, Packages, Payments, Stats)
- `DataTable` — canonical from `@/components/tables/sales/view/data-table`

**Hooks:** `useUserContext`, `useDebounce`.

**Navigation: incoming:** `apps/web/src/components/app-sidebar.tsx` — "Registered" under Customers group.
**Navigation: outgoing:** drawer-only (no deep link out).

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Notes |
|-------|-----------|-------|
| `members` (tenant) | READ | role='client' filter; `hierarchyScopeId` for RBAC |
| `customer_profiles` (tenant) | READ + UPSERT | no branchId — drawer edit writes here |
| `package_instances` (tenant) | READ aggregate | COUNT FILTER WHERE status='active', SUM totalPrice |
| `payments` + `sales_orders` (tenant) | READ aggregate | LTV (lifetime total paid), outstanding (sum status='pending') |
| `user` (control-panel) | READ batch | cross-DB name + email enrichment |

---

## 5. Tests

None yet. Chrome-verified pages render + API wires via search.

---

## 6. Notes

- Uses raw `sql` template for `COUNT(...) FILTER (WHERE ...)` — Drizzle query builder doesn't express it cleanly.
- `accessibleNodeIds` inlined as UUID literal array to work around Neon WebSocket driver array-param quirk.
- Form in drawer uses `useState` (not react-hook-form) — simple form.
- `formatPrice(cents, "MYR")` used directly — the helper already divides by 100.
- Shipped in tracking-pages plan phase 1 (2026-04-18).
- **Walk-in tab removed (2026-04-21):** The page previously used `ConsolidatedTabs` with a Registered and Walk-in tab. The Walk-in tab and all associated tab logic (`validateSearch`, `ConsolidatedTabs`) were removed. The route now renders `<RegisteredCustomersPage />` directly with no tab wrapper.
