# Phase 1: Schema Migration (Additive Only)

**Goal:** Add new columns to existing tables and create the data migration. No tables dropped, no code broken.

**Dependencies:** None — this is the first phase.

**Safety:** All changes are additive (new nullable columns or columns with defaults). Existing code continues to work unchanged.

---

## Task 1.0: Resolve blocking prerequisites

Before any schema changes, resolve the 3 blocking questions from `06-risks-and-open-questions.md`:

### 1.0a: Make `services.categoryId` NOT NULL

**File:** `packages/db/src/schema/tenant/services.ts`

Change:

```typescript
// BEFORE
categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "restrict" }),

// AFTER
categoryId: uuid("category_id").notNull().references(() => serviceCategories.id, { onDelete: "restrict" }),
```

**File:** `packages/api/src/routers/services.ts`

Change `categoryId` from `z.string().uuid().nullable().optional()` to `z.string().uuid()` in the `create` input schema. Keep it optional in `update`.

**Migration step:** Before applying the NOT NULL constraint, backfill existing services that have `categoryId = NULL`:
- Query all branches that have services
- For each branch, create a "General" service category if none exists
- Update all services with `categoryId IS NULL` to use the General category

### 1.0b: Add `"both"` to `services.type` options

**File:** `packages/db/src/schema/tenant/services.ts`

The `type` column is a text field (no enum) with comment `// "private" | "semi_private"`. Update the comment to include `"both"`:

```typescript
type: text("type").default("private").notNull(), // "private" | "semi_private" | "both"
```

**File:** `packages/api/src/routers/services.ts`

Update any validation that restricts `type` values to include `"both"`.

### 1.0c: Decide on `crossUsageEnabled` / `allowedServiceIds` / `autoGenerateInvoice`

Run on dev DB:

```sql
SELECT COUNT(*) FROM packages WHERE cross_usage_enabled = true;
SELECT COUNT(*) FROM packages WHERE allowed_service_ids IS NOT NULL;
SELECT COUNT(*) FROM packages WHERE auto_generate_invoice = true;
```

If all return 0: drop these fields entirely (don't migrate them).
If any return > 0: add them to `services` table in Task 1.1.

**Acceptance criteria:**
- `services.categoryId` is NOT NULL with all existing rows backfilled
- `services.type` accepts `"both"`
- Decision documented for the 3 package-only fields

---

## Task 1.1: Add columns to `services` table

**File:** `packages/db/src/schema/tenant/services.ts`

Add after the existing `schedulingType` column:

```typescript
// Package-equivalent fields (absorbing packages table)
sessionCount: integer("session_count"),          // Number of sessions in this service (null = unlimited/single)
expirable: boolean("expirable").default(false).notNull(),
expiryDays: integer("expiry_days"),              // Days from purchase/assignment to expiry (null = no expiry or use expiryDate)
expiryDate: timestamp("expiry_date"),            // Fixed expiry date (null = use expiryDays or no expiry)
```

Add index:

```typescript
expiryDaysIdx: index("services_expiry_days_idx").on(table.expiryDays),
```

**Acceptance criteria:**
- `bun db:push` succeeds
- Existing service queries still work (new columns are nullable/defaulted)

---

## Task 1.2: Add columns to `package_instances` table

**File:** `packages/db/src/schema/tenant/package-instances.ts`

Step 1 — Add `serviceId` column alongside existing `packageId`:

```typescript
serviceId: uuid("service_id")
    .references(() => services.id, { onDelete: "restrict" }),
```

Add import at top:

```typescript
import { services } from "./services";
```

Step 2 — Add package-specific columns:

```typescript
crossUsageEnabled: boolean("cross_usage_enabled").default(false).notNull(),
autoGenerateInvoice: boolean("auto_generate_invoice").default(false).notNull(),
```

Add index:

```typescript
serviceIdIdx: index("package_instances_service_idx").on(table.serviceId),
```

**Important:** Do NOT remove `packageId` yet. Both columns coexist during migration. `packageId` is dropped in Phase 4.

**Acceptance criteria:**
- `bun db:push` succeeds
- `packageId` still works for existing code
- `serviceId` is nullable (new instances will populate it)

---

## Task 1.3: Add cancellation columns to `sales_orders` table

**File:** `packages/db/src/schema/tenant/sales-orders.ts`

Add after `notes`:

```typescript
// Cancellation metadata (populated when status = "cancelled")
cancellationNumber: text("cancellation_number").unique(),
cancellationDate: timestamp("cancellation_date"),
cancellationReason: text("cancellation_reason"),
cancelledBy: text("cancelled_by"),  // members.userId (text, no FK)
```

Add index:

```typescript
cancellationNumberIdx: index("sales_orders_cancellation_number_idx").on(table.cancellationNumber),
cancellationDateIdx: index("sales_orders_cancellation_date_idx").on(table.cancellationDate),
```

**Acceptance criteria:**
- `bun db:push` succeeds
- Existing sales order queries unaffected

---

## Task 1.4: Write data migration script

**File:** `apps/server/scripts/migrate-schema-consolidation.ts`

This script migrates data from the old tables into the new columns. Run it ONCE after Task 1.1-1.3 are pushed.

```typescript
/**
 * Schema Consolidation Data Migration
 *
 * 1. Copy packages data into services (new columns)
 * 2. Populate package_instances.serviceId from packages.id → services mapping
 * 3. Copy cancelled_sales data into sales_orders cancellation columns
 *
 * Run: cd apps/server && bun run scripts/migrate-schema-consolidation.ts
 * Idempotent: safe to re-run.
 */
```

### Step 1: Migrate packages → services

For each row in `packages`:
- Find or create a matching service (match on `name` + `branchId`, or create new)
- Set `sessionCount`, `expiryDays`, `expiryDate`, `expirable` on the service
- Record the mapping: `packages.id` → `services.id`

### Step 2: Populate package_instances.serviceId

For each `package_instances` row where `serviceId IS NULL`:
- Look up `packageId` in the mapping from Step 1
- Set `serviceId` to the mapped `services.id`
- Set `crossUsageEnabled` from `packages.crossUsageEnabled`
- Set `autoGenerateInvoice` from `packages.autoGenerateInvoice`

### Step 3: Migrate cancelled_sales → sales_orders

For each row in `cancelled_sales`:
- Find the sales order via `salesOrderId`
- Copy `cancellationNumber`, `cancellationDate`, `cancellationReason`, `cancelledBy` to the sales order row

**Acceptance criteria:**
- Script runs without error on dev DB
- All `package_instances` rows have `serviceId` populated
- All cancelled `sales_orders` have cancellation metadata populated
- Script is idempotent (safe to re-run)

---

## Task 1.5: Generate and run Drizzle migration

After Tasks 1.1-1.3, generate a proper migration:

```bash
bun db:generate
bun db:migrate
```

Also update the embedded tenant migration in `packages/db/src/migrate-tenant.ts` for new tenant DBs.

**Acceptance criteria:**
- Migration file generated in `packages/db/src/migrations/tenant/`
- Migration runs cleanly on dev tenant DB
- `bun db:push` shows no diff after migration
