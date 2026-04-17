# Phase 3: RBAC Hardening

**Goal:** Ensure every dashboard page enforces permission checks before rendering, and every data-listing router scopes results to the user's accessible hierarchy nodes. Staff at Branch A must not see data from Branch B.

**User journeys delivered:**
- Journey 4: Staff user navigates to a page outside their permissions and is redirected to dashboard with "unauthorized" feedback (currently they see the page).
- Journey 5: Staff user at Branch A opens sales/payouts/invoices lists and sees only their branch's data (currently they see all branches).

**Dependencies:** Phase 0 (service deduplication). Route guards import from `@/lib/route-guards.ts` which is fully implemented and ready to use. No schema changes required.

---

## Part A: Add `beforeLoad` Guards to 25 Dashboard Pages

### Context

The file `apps/web/src/lib/route-guards.ts` exports four guard functions:
- `requirePermission(permission: string, redirectTo?)` — checks a single `resource:action` key
- `requireAnyPermission(permissions: string[], redirectTo?)` — checks at least one matches
- `requireRole(roleNames: string | string[], redirectTo?)` — checks member role
- `requireSystemAdmin(redirectTo?)` — checks platform admin flag

All guards read from the TanStack Query cache (populated by `useUserContext`), fall back to a single API call on cold load, and throw a TanStack Router `redirect` on failure. System admins bypass all checks.

### Pattern

Every page listed below needs its `Route` definition updated to include a `beforeLoad` hook:

```typescript
import { requirePermission } from "@/lib/route-guards";

export const Route = createFileRoute('...')({
  beforeLoad: () => requirePermission("resource:action"),
  component: PageComponent,
});
```

For the single `requireRole` case (Google Calendar):

```typescript
import { requireRole } from "@/lib/route-guards";

export const Route = createFileRoute('...')({
  beforeLoad: () => requireRole("staff"),
  component: PageComponent,
});
```

### Task 3A.1 — 3A.25: Add guards to each page

All files are under `apps/web/src/routes/_authenticated/dashboard/_layout/`.

| # | Page | File | Guard Call |
|---|------|------|------------|
| 1 | Tax Rates | `settings/tax-rates.tsx` | `requirePermission("tax_configuration:read")` |
| 2 | Expenses | `expenses/view.tsx` | `requirePermission("expense_management:read")` |
| 3 | Promotions | `promotions/view.tsx` | `requirePermission("promotion_management:read")` |
| 4 | Announcements | `announcements/view.tsx` | `requirePermission("announcement_management:read")` |
| 5 | Branch View | `branch/view.tsx` | `requirePermission("hierarchy_management:read")` |
| 6 | Brands | `brands/view.tsx` | `requirePermission("inventory_management:read")` |
| 7 | Cancelled Sales | `cancelled-sales/view.tsx` | `requirePermission("sales_management:read")` |
| 8 | Categories | `categories/view.tsx` | `requirePermission("inventory_management:read")` |
| 9 | Google Calendar | `settings/google-calendar.tsx` | `requireRole("staff")` |
| 10 | Payment | `payment/view.tsx` | `requirePermission("financial_management:read")` |
| 11 | Payouts | `payouts/view.tsx` | `requirePermission("financial_management:read")` |
| 12 | Products | `products/view.tsx` | `requirePermission("inventory_management:read")` |
| 13 | Purchase Orders | `purchase-orders/view.tsx` | `requirePermission("purchase_order_management:read")` |
| 14 | Role | `role/view.tsx` | `requirePermission("role_management:read")` |
| 15 | Sales (list) | `sales/view.tsx` | `requirePermission("sales_management:read")` |
| 16 | Sales (detail) | `sales/$id.tsx` | `requirePermission("sales_management:read")` |
| 17 | Service | `service/view.tsx` | `requirePermission("service_management:read")` |
| 18 | Service Category | `service-category/view.tsx` | `requirePermission("service_management:read")` |
| 19 | Stock Requests | `stock-requests/view.tsx` | `requirePermission("inventory_management:read")` |
| 20 | Suppliers | `suppliers/view.tsx` | `requirePermission("inventory_management:read")` |
| 21 | Transfer Orders | `transfer-orders/view.tsx` | `requirePermission("inventory_management:read")` |
| 22 | UoM | `uom/view.tsx` | `requirePermission("inventory_management:read")` |
| 23 | UoM Conversions | `uom-conversions/view.tsx` | `requirePermission("inventory_management:read")` |
| 24 | User | `user/view.tsx` | `requirePermission("user_management:read")` |
| 25 | Walk-in Customers | `customers/walk-in/view.tsx` | `requirePermission("walk_in_customer_management:read")` |

**Pages intentionally unguarded:**
- `index.tsx` (dashboard home) — all authenticated members see the dashboard
- `notifications/view.tsx` — personal notifications, no permission needed
- `my-services/view.tsx` — self-service, shows only user's own services

### Implementation notes

- Each file needs only two changes: (1) add the import, (2) add `beforeLoad` to the Route config object.
- If a page already has a `beforeLoad` (none currently do), merge the guard call into the existing function.
- The `beforeLoad` function is async-compatible; `requirePermission` returns a `Promise<void>` that resolves silently on success or throws `redirect` on failure.
- Run `bun check-types` after all 25 files are updated to confirm no type errors.

---

## Part B: Add `accessibleNodeIds` Filtering to Data-Listing Routers

### Context

`context.accessibleNodeIds` is an array of hierarchy node UUIDs the current member can access. For admins it contains all nodes; for staff it contains only their scoped subtree. Routers must filter list results to only include records within the user's accessible nodes.

### Already implemented (verify only)

Two routers already pass `accessibleNodeIds` to their service layer:

| Router | File | Status |
|--------|------|--------|
| `stock-requests.ts` | `packages/api/src/routers/stock-requests.ts:49` | Passes `accessibleNodeIds` to service. Service filters by `toBranchId` (JS post-filter). **Verify only.** |
| `purchase-orders.ts` | `packages/api/src/routers/purchase-orders.ts:64` | Passes `accessibleNodeIds` to service. Service uses `inArray(purchaseOrders.branchId, accessibleNodeIds)`. **Verify only.** |
| `sales-orders.ts` | `packages/api/src/routers/sales-orders.ts` | Already passes `accessibleNodeIds` to `listSalesOrders`. **Verify only.** |

**Verify task:** Confirm these three routers produce correct results for a staff user by checking the service layer logic handles the empty-array edge case (admin with all nodes) and the populated-array case (scoped staff).

### Task 3B.1: Payouts router — filter by appointment's branch

**File:** `packages/api/src/routers/payouts.ts`

**Schema analysis:** The `payouts` table has no `branchId` column. Payouts link to `appointments` via `appointmentId`, and `appointments` has `branchId`. Filtering requires a join.

**What to change:**

1. In the `list` handler, after building filter conditions, add `accessibleNodeIds` filtering:

```typescript
import { appointments } from "@avantej-core/db/schema/tenant/appointments";

// In the list handler, change the query to join appointments:
const payoutRows = await context.tenantDb
  .select({ payout: payouts })
  .from(payouts)
  .innerJoin(appointments, eq(payouts.appointmentId, appointments.id))
  .where(and(
    ...conditions,
    context.accessibleNodeIds.length > 0
      ? inArray(appointments.branchId, context.accessibleNodeIds)
      : undefined,
  ))
  .orderBy(desc(payouts.createdAt))
  .limit(input.limit);
```

2. Adjust the result mapping since the shape changes from `payouts.*` to `{ payout: payouts.* }`.

**Note:** If `accessibleNodeIds` is empty (no nodes), no results should be returned. If it contains all nodes (admin), the `inArray` condition is added but matches everything.

### Task 3B.2: Commission splits router — filter by appointment's branch

**File:** `packages/api/src/routers/commission-splits.ts`

**Schema analysis:** `commissionSplits` has `appointmentId` (FK to `appointments`). `appointments` has `branchId`. Requires a join.

**What to change:**

1. In the `list` handler, join `appointments` and filter by `branchId`:

```typescript
import { appointments } from "@avantej-core/db/schema/tenant/appointments";

// Add to WHERE clause via join:
.innerJoin(appointments, eq(commissionSplits.appointmentId, appointments.id))
.where(and(
  ...existingConditions,
  context.accessibleNodeIds.length > 0
    ? inArray(appointments.branchId, context.accessibleNodeIds)
    : undefined,
))
```

### Task 3B.3: Invoices router — filter by sales order's branch

**File:** `packages/api/src/routers/invoices.ts`

**Schema analysis:** `invoices` has no `branchId`. It links to `salesOrders` via `salesOrderId`, and `salesOrders` has `branchId`. Requires a join. Note: `salesOrderId` is nullable (set null on delete), so use `leftJoin` and handle orphaned invoices.

**What to change:**

1. In the `list` handler, join `salesOrders` and filter by `branchId`:

```typescript
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";

// Join and filter:
.leftJoin(salesOrders, eq(invoices.salesOrderId, salesOrders.id))
.where(and(
  ...existingConditions,
  context.accessibleNodeIds.length > 0
    ? inArray(salesOrders.branchId, context.accessibleNodeIds)
    : undefined,
))
```

**Edge case:** Invoices with `salesOrderId = null` (orphaned) will be excluded by `inArray` on a left join. Decide whether orphaned invoices should be visible to all or hidden. Recommendation: include them for admins only by adding `or(isNull(invoices.salesOrderId))` when member role is admin.

### Task 3B.4: Cancelled sales router — filter by branch

**File:** `packages/api/src/routers/cancelled-sales.ts`

**Schema analysis:** Cancelled sales likely queries `salesOrders` with `status = 'cancelled'`. The `salesOrders` table has `branchId` directly.

**What to change:**

1. In the `list` handler, add `accessibleNodeIds` filtering:

```typescript
// Add to WHERE conditions:
if (context.accessibleNodeIds.length > 0) {
  conditions.push(inArray(salesOrders.branchId, context.accessibleNodeIds));
}
```

If cancelled sales uses a separate table, join to `salesOrders` for `branchId`.

### Task 3B.5: Transfer orders router — filter by fromBranch OR toBranch

**File:** `packages/api/src/routers/transfer-orders.ts`

**Schema analysis:** `transferOrders` has `fromBranchId` and `toBranchId`. A user should see a transfer if either the source or destination is in their accessible nodes. The service layer (`transfer-orders.service.ts`) already implements this logic — it accepts `accessibleNodeIds` and filters by `fromBranchId || toBranchId` inclusion.

**What to change:**

1. In the router's `list` handler, pass `context.accessibleNodeIds` to the service:

```typescript
return listTransferOrders(context.tenantDb, {
  ...otherParams,
  accessibleNodeIds: context.accessibleNodeIds,
});
```

**Note:** The service already handles the filtering correctly (lines 71-75 of `transfer-orders.service.ts`). Only the router needs updating to pass the value through.

### Intentionally unfiltered routers (document with code comment)

These routers list org-wide reference data that all members should see regardless of branch scope:

| Router | Reason |
|--------|--------|
| `products.ts` | Products are org-wide catalog items, not branch-scoped |
| `brands.ts` | Brand names are org-wide reference data |
| `suppliers.ts` | Suppliers serve the entire organization |

**What to change:** Add a code comment at the top of each router's `list` handler:

```typescript
// NOTE: Products/Brands/Suppliers are org-wide reference data — intentionally
// NOT filtered by accessibleNodeIds. All members can view the catalog.
```

---

## Verification Steps

1. **Type check:** Run `bun check-types` — zero new errors.
2. **Lint:** Run `bun check` — zero new warnings.
3. **Route generation:** Run the TanStack Router code gen (happens on `bun dev`) and verify `routeTree.gen.ts` regenerates without errors.

---

## Acceptance Criteria

### Part A — Route Guards

- [ ] All 25 pages listed above have a `beforeLoad` guard in their Route definition.
- [ ] A staff user without `expense_management:read` permission navigating to `/dashboard/expenses/view` is redirected to `/dashboard?unauthorized=true`.
- [ ] A staff user WITH the correct permission can access the page normally.
- [ ] System admins bypass all guards and can access every page.
- [ ] Dashboard home (`/dashboard`), notifications, and my-services remain accessible to all authenticated users.
- [ ] `bun check-types` passes with zero errors.

### Part B — Node Filtering

- [ ] Payouts list for a staff user at Branch A returns only payouts linked to appointments at Branch A.
- [ ] Commission splits list for a staff user at Branch A returns only splits linked to appointments at Branch A.
- [ ] Invoices list for a staff user at Branch A returns only invoices linked to sales orders at Branch A.
- [ ] Cancelled sales list for a staff user at Branch A returns only cancelled orders at Branch A.
- [ ] Transfer orders list for a staff user at Branch A returns transfers where Branch A is either source or destination.
- [ ] Stock requests and purchase orders (already implemented) continue to filter correctly.
- [ ] Sales orders (already implemented) continue to filter correctly.
- [ ] Admin users see all records across all branches (no filtering applied).
- [ ] Products, brands, and suppliers lists remain visible to all members (org-wide data).
- [ ] No N+1 query regressions — all filtering uses SQL joins or `inArray`, not post-query JS loops (except stock-requests which uses existing JS filter).

### Regression Checks

- [ ] Existing pages that already work continue to load without errors.
- [ ] The sidebar navigation still shows all links (guards only block navigation, they don't hide sidebar items — sidebar visibility is a separate concern for a future phase).
- [ ] `routeTree.gen.ts` regenerates cleanly after all route file changes.
