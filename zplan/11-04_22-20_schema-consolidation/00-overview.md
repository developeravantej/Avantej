# Schema Consolidation & Form Wiring Fix

## Problem Statement

The tenant database has 5 redundant tables creating data duplication, ambiguous source-of-truth, and confusion about which table to read/write. Additionally, 2 frontend forms were silently replaced by simplified stubs that drop critical business fields.

## Goals

1. Drop 5 redundant tables: `packages`, `package_assignments`, `service_rules`, `service_commission_config`, `cancelled_sales`
2. Consolidate booking rules + commission config to category-level only (`service_category_config`)
3. Rewire frontend data-tables to use the real form components
4. Zero data loss — migrate existing data before dropping tables
5. Keep the native app (Expo) and web app functional throughout

## Blocking Prerequisites (Resolve Before Starting)

**See `06-risks-and-open-questions.md` for full details.**

1. **`services.categoryId` is nullable** — Option A (category-only config) requires every service to have a category. Must either make `categoryId` NOT NULL with a backfill, or define fallback behavior for uncategorized services. **Recommendation: make it required, create a "General" default category, backfill NULLs.**

2. **`services.type` doesn't support `"both"`** — packages have `appointmentType: "both"` but services only have `"private" | "semi_private"`. Must add `"both"` to the text field options before migration.

3. **Package-only fields (`crossUsageEnabled`, `allowedServiceIds`, `autoGenerateInvoice`)** — all seed data shows `false`/`null`. Verify via DB query. If unused, drop entirely. If used, add to `services` table.

---

## What Changes

### Tables Dropped (5)

| Table | Why Redundant | Data Moves To |
|---|---|---|
| `packages` | `services` already defines product (name, price, duration, maxAttendees, type, branchId) | `services` gets new columns: `sessionCount`, `expiryDays`, `expiryDate`, `expirable` |
| `package_assignments` | Superseded by `package_instances` (its own schema comment says so) | Already replaced; just drop |
| `service_rules` | Same booking rules as `service_category_config` with different column names | `service_category_config` (already has these columns) |
| `service_commission_config` | Same commission config as `service_category_config` with different column names | `service_category_config` (already has these columns) |
| `cancelled_sales` | `sales_orders.status` already has `"cancelled"`; unique fields belong on `sales_orders` | `sales_orders` gets: `cancellationNumber`, `cancellationDate`, `cancellationReason`, `cancelledBy` |

### Tables Modified (3)

| Table | Changes |
|---|---|
| `services` | Add columns: `sessionCount` (int), `expiryDays` (int, nullable), `expiryDate` (timestamp, nullable), `expirable` (boolean, default false) |
| `package_instances` | Rename `packageId` to `serviceId` (FK now references `services.id`), add `crossUsageEnabled` (boolean), `autoGenerateInvoice` (boolean) |
| `sales_orders` | Add columns: `cancellationNumber` (text, nullable, unique), `cancellationDate` (timestamp, nullable), `cancellationReason` (text, nullable), `cancelledBy` (text, nullable) |

### API Routers Dropped (3)

| Router | Replacement |
|---|---|
| `packages` | `services` router (already has CRUD) |
| `serviceRules` | New `serviceCategoryConfig` router |
| `serviceCommissionConfig` | New `serviceCategoryConfig` router |

### API Routers Created (1)

| Router | Purpose |
|---|---|
| `serviceCategoryConfig` | Upsert booking rules + commission config on `service_category_config` table |

### API Routers Modified (3)

| Router | Changes |
|---|---|
| `packageInstances` | Change `packageId` references to `serviceId` in all procedures |
| `cancelledSales` | Rewrite to query `sales_orders WHERE status = 'cancelled'` instead of separate table |
| `index.ts` | Remove 3 dropped routers, add 1 new router |

### Frontend Forms Rewired (2)

| Data-table | Current (wrong) | Correct |
|---|---|---|
| `service-category/view/data-table.tsx` | Imports `ServiceCategoryCreateEditDialog` (4 fields) | Import `ServiceFormDialog` from `service-category-form.tsx` (17 fields) |
| `service/view/data-table.tsx` | Imports `ServiceCreateEditDialog` (8 fields) | Import `ServiceFormDialog` from `service-form.tsx` (14 fields) |

### Frontend Form Logic Fixed (1)

| Form | Current (wrong) | Correct |
|---|---|---|
| `service-category-form.tsx` submit | Calls `services.create` + `serviceCommissionConfig.upsert` + `serviceRules.upsert` | Should call `serviceCategories.create` + `serviceCategoryConfig.upsert` |

---

## Impact on Current Flows

### 1. Package Purchase Flow (Native App)

**Current flow:**
```
User browses packages → client.packages.list()
User selects package → buy-package/setup.tsx
User pays → client.packageInstances.create({ packageId })
Dashboard shows active → client.packageInstances.getActiveForClient()
```

**After change:**
```
User browses services → client.services.list() (with sessionCount > 0 filter for "packages")
User selects service → buy-package/setup.tsx (updated to use service fields)
User pays → client.packageInstances.create({ serviceId })
Dashboard shows active → client.packageInstances.getActiveForClient() (unchanged)
```

**What breaks if not handled:** Native app `buy-package/setup.tsx` calls `orpc.packages.list` — will 404 after router removed.

### 2. Package Management (Web Admin)

**Current flow:**
```
Admin creates package → packages/view.tsx → client.packages.create()
Admin views instances → packages/instances/view.tsx → client.packageInstances.listAll()
```

**After change:**
```
Admin creates service (with session/expiry fields) → services page
Admin views instances → instances page → client.packageInstances.listAll() (serviceId instead of packageId)
```

**What breaks if not handled:** Web `packages/view.tsx` calls `client.packages.create/update/archive` — will fail after router removed.

### 3. Service Category Creation (Web Admin)

**Current flow (broken):**
```
Admin opens service category form → service-category-form.tsx
Form submits → creates a SERVICE (not category) + writes to service_commission_config + service_rules
```

**After change (correct):**
```
Admin opens service category form → service-category-form.tsx
Form submits → creates a SERVICE CATEGORY + writes to service_category_config
```

### 4. Commission Calculation

**Current flow:**
```
commission-splits.service.ts creates splits "based on serviceCommissionConfig" (per comment)
But: no code actually reads serviceCommissionConfig — commission-splits.service.ts only reads/writes commission_splits table
```

**After change:**
```
Commission splits reference service_category_config via service.categoryId join
No functional change needed — commission_splits table is kept; only the config source changes
```

### 5. Sales Cancellation

**Current flow:**
```
cancelSalesOrder() → sets sales_orders.status = "cancelled" AND inserts into cancelled_sales
cancelled-sales/view.tsx → client.cancelledSales.list()
```

**After change:**
```
cancelSalesOrder() → sets sales_orders.status = "cancelled" + populates cancellation columns on same row
cancelled-sales/view.tsx → client.salesOrders.list({ status: "cancelled" })
```

---

## Dependency Map — What Breaks During Changes

### Phase 1: Schema Migration (DB only — nothing breaks)
- Adding columns is additive; no existing code breaks
- New columns are nullable or have defaults

### Phase 2: New Router + Modified Routers (backend — frontend breaks if deployed alone)
- `serviceCategoryConfig` router is NEW — no existing code calls it yet
- `packageInstances` router changes `packageId` to `serviceId` — **breaks native app + web if deployed without frontend update**
- `cancelledSales` router rewrite — **breaks web cancelled-sales page if deployed without frontend update**

### Phase 3: Frontend Updates (must deploy WITH Phase 2)
- Web form rewiring + native app package flow updates
- Must be deployed atomically with Phase 2 backend changes

### Phase 4: Drop Old Tables/Routers (safe after Phase 2+3 deployed)
- Only remove code that is no longer referenced
- Migration drops tables only after data has been migrated

### Critical Deployment Rule
**Phases 2 + 3 MUST deploy together.** Backend router changes and frontend updates cannot be split across deployments.

---

## Files Affected — Complete List

### Schema Files (packages/db/src/schema/tenant/)

| File | Action |
|---|---|
| `services.ts` | MODIFY — add 4 columns |
| `package-instances.ts` | MODIFY — rename packageId to serviceId, add 2 columns |
| `sales-orders.ts` | MODIFY — add 4 cancellation columns |
| `packages.ts` | DROP (Phase 4) |
| `package-assignments.ts` | DROP (Phase 4) |
| `service-rules.ts` | DROP (Phase 4) |
| `service-commission-config.ts` | DROP (Phase 4) |
| `cancelled-sales.ts` | DROP (Phase 4) |
| `index.ts` | MODIFY — remove 5 exports |

### API Routers (packages/api/src/routers/)

| File | Action |
|---|---|
| `service-category-config.ts` | CREATE — new upsert router |
| `package-instances.ts` | MODIFY — packageId to serviceId |
| `cancelled-sales.ts` | MODIFY — rewrite to query sales_orders |
| `packages.ts` | DROP (Phase 4) |
| `service-rules.ts` | DROP (Phase 4) |
| `service-commission-config.ts` | DROP (Phase 4) |
| `index.ts` | MODIFY — remove 3 routers, add 1 router |

### Services Layer (packages/services/src/)

| File | Action |
|---|---|
| `package.service.ts` | DROP (Phase 4) |
| `package-instance.service.ts` | MODIFY — packageId to serviceId |
| `sales-order.service.ts` | MODIFY — rewrite cancelSalesOrder to write to sales_orders instead of cancelled_sales |
| `index.ts` | MODIFY — remove package service exports |

### Web Frontend (apps/web/src/)

| File | Action |
|---|---|
| `components/tables/service-category/view/data-table.tsx` | MODIFY — rewire import |
| `components/tables/service/view/data-table.tsx` | MODIFY — rewire import |
| `components/forms/service-category-form.tsx` | MODIFY — fix submit handler |
| `routes/.../packages/view.tsx` | MODIFY — convert to services-based |
| `routes/.../packages/instances/view.tsx` | MODIFY — packageId to serviceId |
| `routes/.../cancelled-sales/view.tsx` | MODIFY — use salesOrders.list filter |
| `components/forms/service-category-create-edit-dialog.tsx` | DELETE (Phase 4) |
| `components/forms/service-create-edit-dialog.tsx` | DELETE (Phase 4) |
| `__tests__/routes/packages.test.tsx` | MODIFY — update to services |

### Native App (apps/native/)

| File | Action |
|---|---|
| `app/(app)/dashboard/buy-package/setup.tsx` | MODIFY — packages.list to services.list |
| `app/(app)/dashboard/buy-package/pay.tsx` | MODIFY — packageInstances.create({ serviceId }) |
| `app/(app)/dashboard/book-workout/book-workout.tsx` | MODIFY — packageInstances field references |
| `app/(app)/dashboard/packages/index.tsx` | MODIFY — packageInstances field references |
| `app/(app)/dashboard/index.tsx` | MODIFY — packageInstances field references |
| `contexts/purchase-flow-context.tsx` | MODIFY — rename `packageId` to `serviceId` in state interface and default state |

### Scripts & Tests (apps/server/)

| File | Action |
|---|---|
| `scripts/test-write-endpoints.ts` | MODIFY — remove serviceRules/serviceCommissionConfig references |
| `scripts/inspect-and-cleanup-test-data.ts` | MODIFY — remove references |
| `scripts/seed-business-data.ts` | MODIFY — change `packages` table inserts to `services` table inserts |
| `scripts/seed-app-data.ts` | MODIFY — change `packages` table inserts to `services` table inserts |
| `src/tests/unit/services/sales-order.test.ts` | MODIFY — update `cancelledSale` destructuring to match new return type |

### Embedded Migration

| File | Action |
|---|---|
| `packages/db/src/migrate-tenant.ts` | MODIFY — contains raw SQL strings (not Drizzle schema), must edit SQL template literals for dropped tables and added columns |
