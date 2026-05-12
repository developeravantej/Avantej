# Schema Consolidation — What Changed and Why

**Date:** 2026-04-11
**Branch:** Customer-app
**Scope:** 39 files changed, 533 insertions, 1,895 deletions (net -1,362 lines)

---

## Why This Was Done

The tenant database had **5 redundant tables** that created data duplication, ambiguous source-of-truth, and confusion about which table to read or write. Additionally, 2 frontend forms had been silently replaced by simplified stubs that dropped critical business fields.

### The Problem Tables

| Table | Why It Was Redundant |
|---|---|
| `packages` | `services` already defines the same product concept (name, price, duration, max attendees, type, branch). Packages were just services with a session count. |
| `package_assignments` | Already superseded by `package_instances` — its own schema comment acknowledged this. |
| `service_rules` | Stored the same booking rules (advance booking, cancellation window) as `service_category_config`, just with different column names and a per-service FK instead of per-category. |
| `service_commission_config` | Stored the same commission config (incentive type, staff weightage, payment structures) as `service_category_config`, again per-service instead of per-category. |
| `cancelled_sales` | `sales_orders.status` already tracked "cancelled" state. The unique cancellation metadata (number, date, reason, cancelled-by) belonged on the sales order row itself. |

### The Problem Forms

The service category data-table imported `ServiceCategoryCreateEditDialog` — a 4-field stub (name, description, display order, active). The real form (`service-category-form.tsx`) with 17 fields (duration, max attendees, booking rules, commission config, staff weightage) existed but wasn't wired up.

Similarly, the service data-table imported `ServiceCreateEditDialog` — an 8-field stub. The real form (`service-form.tsx`) with 14 fields (expirable, sessions, tax, time-preset config) was disconnected.

Worse, the service-category-form's submit handler was creating a **service** (not a category) and writing to the per-service config tables (`service_commission_config`, `service_rules`) instead of the category-level table.

---

## What Changed

### Database Schema

**Tables dropped (5):**
- `packages` — data absorbed into `services` via new columns
- `package_assignments` — already replaced by `package_instances`
- `service_rules` — consolidated into `service_category_config`
- `service_commission_config` — consolidated into `service_category_config`
- `cancelled_sales` — cancellation metadata moved to `sales_orders` columns

**Tables modified (3):**

| Table | Columns Added |
|---|---|
| `services` | `sessionCount` (int), `expirable` (bool), `expiryDays` (int), `expiryDate` (timestamp) |
| `sales_orders` | `cancellationNumber` (text, unique), `cancellationDate` (timestamp), `cancellationReason` (text), `cancelledBy` (text) |
| `package_instances` | `serviceId` (uuid, NOT NULL, FK to services) — replaces `packageId` which was removed |

The `services.type` field now accepts `"both"` in addition to `"private"` and `"semi_private"`, matching what `packages.appointmentType` previously supported.

### API Layer

**Routers dropped (3):**
- `packages` — CRUD for the dropped `packages` table
- `serviceRules` — per-service booking rules (now category-level)
- `serviceCommissionConfig` — per-service commission config (now category-level)

**Router created (1):**
- `serviceCategoryConfig` — upsert booking rules + commission config on `service_category_config` table. Supports `upsert` (INSERT...ON CONFLICT DO UPDATE on `categoryId`) and `getByCategoryId`.

**Routers modified (3):**
- `packageInstances` — `create` now requires `serviceId` instead of `packageId`
- `cancelledSales` — rewritten to query `sales_orders WHERE status = 'cancelled'` instead of the dropped `cancelled_sales` table. Response shape preserved for backwards compatibility.
- `services` — `create` and `update` accept new package-equivalent fields (`sessionCount`, `expirable`, `expiryDays`, `expiryDate`) and the `"both"` type option

**Service layer modified (3):**
- `sales-order.service.ts` — `cancelSalesOrder` now writes cancellation metadata directly to `sales_orders` row instead of inserting into `cancelled_sales`. Returns the updated order directly (not `{ salesOrder, cancelledSale }`). `generateCancellationNumber` queries `sales_orders` instead of `cancelled_sales`.
- `package-instance.service.ts` — `CreatePackageInstanceParams` requires `serviceId`, `packageId` removed
- `service.service.ts` — types updated for `"both"` type and new package-equivalent fields

### Web Frontend

**Forms rewired (2):**
- Service category data-table now imports `ServiceFormDialog` from `service-category-form.tsx` (real 17-field form) instead of the 4-field stub
- Service data-table now imports `ServiceFormDialog` from `service-form.tsx` (real 14-field form) instead of the 8-field stub

**Form logic fixed (1):**
- `service-category-form.tsx` submit handler now correctly creates a **service category** + upserts `serviceCategoryConfig` instead of creating a service + writing to per-service config tables

**Pages updated (3):**
- `packages/view.tsx` — calls `client.services.list()` (filtered for `sessionCount > 0`) instead of `client.packages.list()`. Create/update/archive use the `services` router. Removed `crossUsageEnabled` and `autoGenerateInvoice` checkboxes (unused fields).
- `packages/instances/view.tsx` — package selector uses `client.services.list()`. Instance creation passes `serviceId` instead of `packageId`.
- `cancelled-sales/view.tsx` — added type guard for `cancellationDate` (handles both string and Date)

**Stubs deleted (2):**
- `service-category-create-edit-dialog.tsx`
- `service-create-edit-dialog.tsx`

### Scripts & Tests

- `seed-business-data.ts` — package seed inserts converted to service inserts
- `seed-app-data.ts` — same conversion
- `test-write-endpoints.ts` — removed references to dropped routers
- `inspect-and-cleanup-test-data.ts` — removed references to dropped tables
- `sales-order.test.ts` — updated for new `cancelSalesOrder` return type (flat order instead of `{ salesOrder, cancelledSale }`)
- `packages.test.tsx` — updated mock calls from `client.packages.*` to `client.services.*`

---

## Design Decisions

### 1. `categoryId` kept nullable on `services`

Making it NOT NULL requires a live DB backfill (creating a "General" default category per branch, updating all NULL rows). This is safer as a separate follow-up after verifying all services have categories in production.

### 2. `crossUsageEnabled`, `allowedServiceIds`, `autoGenerateInvoice` dropped entirely

All seed data showed `false`/`null` for these fields. No business logic reads them. Rather than migrate unused fields, they were removed. If needed later, they can be re-added with proper design.

### 3. `cancelledSales` router kept as compatibility alias

The router was rewritten (not deleted) to query `sales_orders WHERE status = 'cancelled'` and map the response to the previous shape. This avoids breaking the cancelled-sales frontend page without requiring it to change its API calls.

### 4. Packages page kept as separate route

After consolidation, "packages" are just services with `sessionCount > 0`. The page was preserved as a filtered view of services rather than merged into the services page — least disruptive to users. Can be revisited in a future UI cleanup.

---

## Remaining TODOs

1. **Generate Drizzle migration:** `bun db:generate && bun db:migrate` to create the SQL migration file for the schema changes
2. **Run data migration script:** `cd apps/server && bun run scripts/migrate-schema-consolidation.ts` to copy existing package data into services and populate `serviceId` on package instances
3. **Update embedded tenant migration:** `packages/db/src/migrate-tenant.ts` contains raw SQL strings for new tenant DBs — must be updated to include the new columns and exclude the dropped tables
4. **Consider making `services.categoryId` NOT NULL** in a follow-up after backfilling all NULL rows
5. **Native app updates** were deferred — `apps/native` still references `client.packages.*` and `packageId` in several files

---

## Files Changed (Complete List)

### Created (2)
- `packages/api/src/routers/service-category-config.ts`
- `apps/server/scripts/migrate-schema-consolidation.ts`

### Deleted (11)
- `packages/api/src/routers/packages.ts`
- `packages/api/src/routers/service-rules.ts`
- `packages/api/src/routers/service-commission-config.ts`
- `packages/services/src/package.service.ts`
- `packages/db/src/schema/tenant/packages.ts`
- `packages/db/src/schema/tenant/package-assignments.ts`
- `packages/db/src/schema/tenant/service-rules.ts`
- `packages/db/src/schema/tenant/service-commission-config.ts`
- `packages/db/src/schema/tenant/cancelled-sales.ts`
- `apps/web/src/components/forms/service-category-create-edit-dialog.tsx`
- `apps/web/src/components/forms/service-create-edit-dialog.tsx`

### Modified (28)
- `packages/db/src/schema/tenant/services.ts`
- `packages/db/src/schema/tenant/package-instances.ts`
- `packages/db/src/schema/tenant/sales-orders.ts`
- `packages/db/src/schema/tenant/index.ts`
- `packages/db/src/schema/tenant/appointment-clients.ts`
- `packages/api/src/routers/index.ts`
- `packages/api/src/routers/services.ts`
- `packages/api/src/routers/package-instances.ts`
- `packages/api/src/routers/cancelled-sales.ts`
- `packages/services/src/service.service.ts`
- `packages/services/src/package-instance.service.ts`
- `packages/services/src/sales-order.service.ts`
- `packages/services/src/index.ts`
- `apps/web/src/components/tables/service-category/view/data-table.tsx`
- `apps/web/src/components/tables/service/view/data-table.tsx`
- `apps/web/src/components/forms/service-category-form.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx`
- `apps/web/src/components/app-sidebar.tsx`
- `apps/web/src/routeTree.gen.ts`
- `apps/web/src/__tests__/helpers/mock-client.ts`
- `apps/web/src/__tests__/routes/packages.test.tsx`
- `apps/server/scripts/seed-business-data.ts`
- `apps/server/scripts/seed-app-data.ts`
- `apps/server/scripts/test-write-endpoints.ts`
- `apps/server/scripts/inspect-and-cleanup-test-data.ts`
- `apps/server/src/tests/unit/services/sales-order.test.ts`
