# Phase 4: Cleanup — Drop Redundant Tables & Dead Code

**Goal:** Remove the 5 redundant tables, 3 old routers, dead service files, and frontend stubs. This is purely subtractive — nothing new is created.

**Dependencies:** Phase 2 + 3 deployed and verified working in production. No code references the old tables/routers.

**Safety:** Before starting this phase, run a final grep to confirm zero references remain:

```bash
# Must return 0 results for each (excluding migrations/snapshots)
grep -r "packages\." --include="*.ts" --include="*.tsx" packages/api packages/services apps/ | grep -v migration | grep -v snapshot | grep -v node_modules
grep -r "serviceRules\." --include="*.ts" --include="*.tsx" packages/api packages/services apps/ | grep -v migration | grep -v snapshot
grep -r "serviceCommissionConfig\." --include="*.ts" --include="*.tsx" packages/api packages/services apps/ | grep -v migration | grep -v snapshot
grep -r "cancelledSales\." --include="*.ts" --include="*.tsx" packages/api packages/services apps/ | grep -v migration | grep -v snapshot
grep -r "packageAssignments\." --include="*.ts" --include="*.tsx" packages/api packages/services apps/ | grep -v migration | grep -v snapshot
```

---

## Task 4.1: Remove old API routers

**Files (DELETE):**
- `packages/api/src/routers/packages.ts`
- `packages/api/src/routers/service-rules.ts`
- `packages/api/src/routers/service-commission-config.ts`

**File (MODIFY):** `packages/api/src/routers/index.ts`

Remove imports:

```typescript
// DELETE these lines
import { packagesRouter } from "./packages";
import { serviceCommissionConfigRouter } from "./service-commission-config";
import { serviceRulesRouter } from "./service-rules";
```

Remove from `baseRouter`:

```typescript
// DELETE these entries
packages: packagesRouter,
serviceCommissionConfig: serviceCommissionConfigRouter,
serviceRules: serviceRulesRouter,
```

**Acceptance criteria:**
- `bun check-types` passes
- No 404s in web or native app (already updated in Phase 3)

---

## Task 4.2: Remove old service layer files

**File (DELETE):**
- `packages/services/src/package.service.ts`

**File (MODIFY):** `packages/services/src/index.ts`

Remove exports:

```typescript
// DELETE these lines
export * from "./package.service";
```

Also remove any named exports that reference the deleted file (e.g., `createPackage`, `updatePackage`, `archivePackage`, `listPackages`, `getPackageById`).

**Acceptance criteria:**
- `bun check-types` passes
- No import errors

---

## Task 4.3: Remove old schema files

**Files (DELETE):**
- `packages/db/src/schema/tenant/packages.ts`
- `packages/db/src/schema/tenant/package-assignments.ts`
- `packages/db/src/schema/tenant/service-rules.ts`
- `packages/db/src/schema/tenant/service-commission-config.ts`
- `packages/db/src/schema/tenant/cancelled-sales.ts`

**File (MODIFY):** `packages/db/src/schema/tenant/index.ts`

Remove exports:

```typescript
// DELETE these lines
export * from "./packages";
export * from "./package-assignments";
export * from "./service-rules";
export * from "./service-commission-config";
export * from "./cancelled-sales";
```

**File (MODIFY):** `packages/db/src/schema/tenant/package-instances.ts`

Remove the `packageId` column and its import of `packages`:

```typescript
// DELETE
import { packages } from "./packages";

// DELETE the packageId column definition
packageId: uuid("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "restrict" }),

// MAKE serviceId required (was nullable during transition)
serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "restrict" }),
```

Remove the `packageIdIdx` index and keep the `serviceIdIdx`.

**Acceptance criteria:**
- `bun check-types` passes
- `package_instances` schema only has `serviceId`, no `packageId`

---

## Task 4.4: Remove frontend stub files

**Files (DELETE):**
- `apps/web/src/components/forms/service-category-create-edit-dialog.tsx`
- `apps/web/src/components/forms/service-create-edit-dialog.tsx`

**Acceptance criteria:**
- No import errors (already rewired in Phase 3)
- `bun check-types` passes

---

## Task 4.5: Generate final DB migration

Generate a Drizzle migration that:

1. Drops the `packageId` column from `package_instances` (serviceId is now the only FK)
2. Drops the 5 tables: `packages`, `package_assignments`, `service_rules`, `service_commission_config`, `cancelled_sales`

```bash
bun db:generate
bun db:migrate
```

**Order matters in the migration SQL:**
1. Drop FK constraint on `package_instances.packageId` first
2. Drop `package_instances.packageId` column
3. Make `package_instances.serviceId` NOT NULL
4. Drop `package_assignments` (depends on `packages`)
5. Drop `cancelled_sales` (depends on `sales_orders`, `invoices`)
6. Drop `packages`
7. Drop `service_rules` (depends on `services`)
8. Drop `service_commission_config` (depends on `services`)

Also update the embedded tenant migration in `packages/db/src/migrate-tenant.ts`.

**Acceptance criteria:**
- Migration runs cleanly on dev tenant DB
- `bun db:push` shows no diff after migration
- All 5 tables are gone from the database

---

## Task 4.6: Remove cancelled_sales router

After Task 4.5, the `cancelledSales` router (rewritten in Phase 2 to query `sales_orders`) can optionally be kept as a convenience alias, or removed and replaced by a filter on the `salesOrders` router.

If removing:

**File (DELETE):** `packages/api/src/routers/cancelled-sales.ts`

**File (MODIFY):** `packages/api/src/routers/index.ts` — remove import and `cancelledSales` entry

**File (MODIFY):** `apps/web/src/routes/.../cancelled-sales/view.tsx` — change to `client.salesOrders.list({ status: "cancelled" })`

If keeping as alias: no action needed (it already queries `sales_orders`).

**Acceptance criteria:**
- Cancelled sales page works regardless of approach chosen

---

## Phase 4 Completion Checklist

- [ ] 3 old API routers deleted
- [ ] 1 old service file deleted
- [ ] 5 old schema files deleted
- [ ] 2 frontend stub files deleted
- [ ] `package_instances.packageId` column removed, `serviceId` is now NOT NULL
- [ ] Tenant schema index updated (5 exports removed)
- [ ] Router index updated (3 imports/entries removed)
- [ ] Services index updated (package exports removed)
- [ ] Final migration generated and applied
- [ ] `bun check-types` passes across entire monorepo
- [ ] `bun test` passes
- [ ] No grep hits for dropped table/router names (outside of migrations)

---

## Post-Cleanup Verification

Run the full verification suite:

```bash
bun check          # Biome lint
bun check-types    # TypeScript
cd apps/server && bun test          # Backend tests
cd apps/web && bun test             # Frontend tests
```

Manually verify in browser/simulator:
- [ ] Create a service category with full config (duration, rules, commission)
- [ ] Create a service with all fields (expirable, tax, time-preset)
- [ ] Purchase a package (service with sessions) from native app
- [ ] View package instances on web admin
- [ ] Cancel a sales order and verify cancellation data on sales_orders row
- [ ] View cancelled sales page
