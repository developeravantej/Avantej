# Phase 1: Write the atomic SQL migration and source schema fixes

**Goal:** Hand-write `packages/db/src/migrations/0010_schema_consolidation.sql` containing all DDL, data backfill, and constraint enforcement in one atomic transaction. Add the missing `cancelledAmount` column to the source schema. Wire up `cancelSalesOrder` and the cancelled-sales router to persist and return it. Delete the obsolete TS migration script.

**User journey this advances:** None directly. Phase 1 produces the artifact Phase 2 applies.

**Dependencies:** None — Phase 1 is the first phase.

---

## Tasks

### Task 1.1 — Add `cancelled_amount` column to `sales_orders` schema (20 min)

**Why:** The `cancelSalesOrder` service function accepts `refundAmount: number` as a parameter but never writes it anywhere. The legacy `cancelled_sales` table had `cancelled_amount integer NOT NULL` for exactly this purpose. The consolidated `sales_orders` schema lost the column, which makes partial refunds impossible to persist and makes the cancelled-sales router return the wrong amount.

**File:** `packages/db/src/schema/tenant/sales-orders.ts`

**Change:**

```ts
// Add next to the existing cancellation columns (after line 24 `cancelledBy`)
cancelledAmount: integer("cancelled_amount"), // partial or full refund amount in cents
```

Leave nullable. Populated only when a cancellation happens.

**Also update the index block** if you want query support on it (optional — not likely needed).

**Acceptance:** Source compiles. `bun check-types` green for the schema package.

---

### Task 1.2 — Persist `refundAmount` in `cancelSalesOrder` (15 min)

**File:** `packages/services/src/sales-order.service.ts`

**Current code (lines 164-195):**

```ts
export async function cancelSalesOrder(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string,
  params: { cancelledBy: string; reason?: string; refundAmount: number }
): Promise<typeof salesOrders.$inferSelect> {
  const existing = await getSalesOrderById(tenantDb, id);
  if (!existing) {
    throw new Error("Sales order not found");
  }

  const now = new Date();
  const cancellationNumber = await generateCancellationNumber(tenantDb, now);

  const [updatedOrder] = await tenantDb
    .update(salesOrders)
    .set({
      status: "cancelled",
      cancellationNumber,
      cancellationDate: now,
      cancellationReason: params.reason ?? null,
      cancelledBy: params.cancelledBy,
      updatedAt: now,
      // ← refundAmount is silently dropped
    })
    .where(eq(salesOrders.id, id))
    .returning();
  // ...
}
```

**Fix:** Add the `cancelledAmount` write:

```ts
.set({
  status: "cancelled",
  cancellationNumber,
  cancellationDate: now,
  cancellationReason: params.reason ?? null,
  cancelledBy: params.cancelledBy,
  cancelledAmount: params.refundAmount,  // ← ADD
  updatedAt: now,
})
```

Also validate — if `refundAmount > existing.totalAmount`, throw. If `refundAmount < 0`, throw. Two lines, keeps callers from writing nonsense:

```ts
if (params.refundAmount < 0 || params.refundAmount > existing.totalAmount) {
  throw new Error(
    `refundAmount ${params.refundAmount} is out of range (order total: ${existing.totalAmount})`
  );
}
```

**Acceptance:** Compiles. Existing `sales-order.test.ts` may need a minor update if it asserts the updated row shape — check and fix.

---

### Task 1.3 — Fix the `cancelledSales` router to return the persisted amount (15 min)

**File:** `packages/api/src/routers/cancelled-sales.ts`

**Current code (lines 56-67 and 111-122):**

```ts
return rows.map((row) => ({
  id: row.id,
  cancellationNumber: row.cancellationNumber,
  salesOrderId: row.id,
  cancellationDate: row.cancellationDate,
  cancelledAmount: row.totalAmount,  // ← WRONG: returns full total, not the refund amount
  cancellationReason: row.cancellationReason,
  cancelledBy: row.cancelledBy,
  customerId: row.customerId,
  customerName: row.customerName,
  createdAt: row.createdAt,
}));
```

**Fix:** Return `row.cancelledAmount` with a fallback to `row.totalAmount` for rows migrated from the legacy table (where the backfill SQL copied `cancelled_sales.cancelled_amount` into the new column, but some rows may have slipped through):

```ts
cancelledAmount: row.cancelledAmount ?? row.totalAmount,
```

Apply the same fix in both the `list` and `getById` procedures.

**Acceptance:** Router returns real cancellation amounts. Null fallback only triggers on rows that slipped the backfill — Phase 2 pre-flight will flag those.

---

### Task 1.4 — Delete the obsolete TS migration script (2 min)

**Files:**
- `apps/server/scripts/migrate-schema-consolidation.ts` — delete
- `zplan/11-04_22-20_schema-consolidation/` — leave alone (historical)

Grep to confirm nothing imports it:

```bash
grep -rn "migrate-schema-consolidation" apps packages
```

Should return zero non-doc matches.

**Acceptance:** File gone, no broken imports.

---

### Task 1.5 — Write `0010_schema_consolidation.sql` by hand (2–3 hours)

**File:** `packages/db/src/migrations/0010_schema_consolidation.sql`

This is the load-bearing artifact for Phase 2. Every statement is deliberate.

**Structure:**
1. BEGIN transaction (implicit with `psql -f`, but make it explicit for clarity)
2. ADD new columns (nullable, no constraints yet)
3. UPDATE backfill from legacy tables (`packages`, `package_assignments`, `cancelled_sales` still exist at this point)
4. Add constraints (NOT NULL, FK, UNIQUE) — only after backfill succeeds
5. DROP legacy columns and tables
6. CREATE new indexes

Here is the full file. Review line-by-line before saving — small details (ON DELETE semantics, column ordering in indexes) matter.

```sql
-- 0010_schema_consolidation.sql
-- Schema consolidation for Customer-app branch.
-- Drops 5 redundant tables and absorbs their data into services, sales_orders, package_instances.
-- Atomic: if any statement fails, the whole migration rolls back.

BEGIN;

-- ============================================================================
-- SECTION 1: ADD NEW COLUMNS (nullable, no constraints yet)
-- ============================================================================

-- services gets the package-equivalent fields
ALTER TABLE services ADD COLUMN IF NOT EXISTS session_count integer;
ALTER TABLE services ADD COLUMN IF NOT EXISTS expirable boolean DEFAULT false NOT NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS expiry_days integer;
ALTER TABLE services ADD COLUMN IF NOT EXISTS expiry_date timestamp;

-- sales_orders gets cancellation metadata (previously in its own table)
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancellation_number text;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancellation_date timestamp;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancelled_by text;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancelled_amount integer;

-- package_instances gets service_id (will replace package_id)
-- Nullable at first — we'll enforce NOT NULL after backfill.
ALTER TABLE package_instances ADD COLUMN IF NOT EXISTS service_id uuid;

-- ============================================================================
-- SECTION 2: PRE-FLIGHT CHECKS (abort if preconditions are not met)
-- ============================================================================

-- 2a. Every package must map to exactly one service by (name, branch_id)
DO $$
DECLARE
  unmapped_count integer;
BEGIN
  SELECT COUNT(*) INTO unmapped_count
  FROM packages p
  WHERE NOT EXISTS (
    SELECT 1 FROM services s
    WHERE s.name = p.name
      AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  );
  IF unmapped_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package(s) have no matching service (match by name + branch_id). Resolve manually before re-running.', unmapped_count;
  END IF;
END $$;

-- 2b. Every package name+branch must match exactly ONE service (not ambiguous)
DO $$
DECLARE
  ambiguous_count integer;
BEGIN
  SELECT COUNT(*) INTO ambiguous_count FROM (
    SELECT p.id
    FROM packages p
    JOIN services s ON s.name = p.name AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
    GROUP BY p.id
    HAVING COUNT(s.id) > 1
  ) ambiguous;
  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package(s) have ambiguous service matches. Services with duplicate (name, branch_id) must be deduplicated first.', ambiguous_count;
  END IF;
END $$;

-- 2c. Every package_instances.package_id must resolve to a known package
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM package_instances pi
  WHERE pi.package_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = pi.package_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % package_instances row(s) reference non-existent packages. Delete orphans before re-running.', orphan_count;
  END IF;
END $$;

-- 2d. Every cancelled_sales.sales_order_id must resolve to a known sales order
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM cancelled_sales cs
  WHERE NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = cs.sales_order_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % cancelled_sales row(s) reference non-existent sales orders.', orphan_count;
  END IF;
END $$;

-- 2e. No duplicate cancellation_number values
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT cancellation_number FROM cancelled_sales
    GROUP BY cancellation_number HAVING COUNT(*) > 1
  ) dups;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Schema consolidation aborted: % duplicate cancellation_number(s) in cancelled_sales.', dup_count;
  END IF;
END $$;

-- ============================================================================
-- SECTION 3: BACKFILL NEW COLUMNS FROM LEGACY TABLES
-- ============================================================================

-- 3a. services: copy session_count, expirable, expiry_days, expiry_date from matching packages
--     IS NOT DISTINCT FROM handles NULL-equal semantics for branch_id
UPDATE services s
SET session_count = p.session_count,
    expirable     = (p.expiry_days IS NOT NULL OR p.expiry_date IS NOT NULL),
    expiry_days   = p.expiry_days,
    expiry_date   = p.expiry_date,
    updated_at    = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.session_count IS NULL;  -- idempotency: don't overwrite if already set

-- 3b. services: optionally absorb appointment_type + price_per_session IF the service
--     row looks "default-ish" (i.e. it wasn't explicitly configured with its own values).
--     "Default-ish" heuristic: type = 'private' (the schema default) and price IS NULL.
--     This avoids clobbering a deliberately-configured service with package data.
UPDATE services s
SET type = p.appointment_type,
    updated_at = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.type = 'private'  -- only override the default
  AND p.appointment_type IN ('private', 'semi_private', 'both');

UPDATE services s
SET price = p.price_per_session,
    updated_at = now()
FROM packages p
WHERE s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
  AND s.price IS NULL
  AND p.price_per_session IS NOT NULL;

-- 3c. package_instances: backfill service_id via the packages→services mapping
UPDATE package_instances pi
SET service_id = s.id,
    updated_at = now()
FROM packages p
JOIN services s
  ON s.name = p.name
  AND (s.branch_id IS NOT DISTINCT FROM p.branch_id)
WHERE pi.package_id = p.id
  AND pi.service_id IS NULL;  -- idempotency

-- 3d. sales_orders: copy cancellation metadata from cancelled_sales
--     cancelled_amount comes from cancelled_sales.cancelled_amount (NOT totalAmount —
--     this is the whole point of the partial-refund fix)
UPDATE sales_orders so
SET cancellation_number = cs.cancellation_number,
    cancellation_date   = cs.cancellation_date,
    cancellation_reason = cs.cancellation_reason,
    cancelled_by        = cs.cancelled_by,
    cancelled_amount    = cs.cancelled_amount,
    updated_at          = now()
FROM cancelled_sales cs
WHERE so.id = cs.sales_order_id
  AND so.cancellation_number IS NULL;  -- idempotency

-- ============================================================================
-- SECTION 4: POST-BACKFILL CHECKS
-- ============================================================================

-- 4a. Every package_instance should now have a service_id
DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM package_instances WHERE service_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill check failed: % package_instances row(s) still have NULL service_id.', null_count;
  END IF;
END $$;

-- 4b. Every cancelled sales_order should have a cancellation_number
DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM sales_orders
  WHERE status = 'cancelled' AND cancellation_number IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Backfill check failed: % cancelled sales_orders have no cancellation_number.', missing_count;
  END IF;
END $$;

-- ============================================================================
-- SECTION 5: ENFORCE NEW CONSTRAINTS
-- ============================================================================

-- package_instances.service_id: NOT NULL + FK
ALTER TABLE package_instances ALTER COLUMN service_id SET NOT NULL;
ALTER TABLE package_instances
  ADD CONSTRAINT package_instances_service_id_services_id_fk
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE restrict;

-- sales_orders.cancellation_number: unique constraint (all currently-populated values are distinct per 2e)
ALTER TABLE sales_orders
  ADD CONSTRAINT sales_orders_cancellation_number_unique UNIQUE (cancellation_number);

-- ============================================================================
-- SECTION 5.5: RENAME appointment_clients ORPHAN COLUMN → package_instance_id
-- ============================================================================
-- Per-client package credit tracking for group classes. The old column FK'd to
-- the dropped package_assignments table; we rename and re-point at package_instances.
-- Legacy UUID values are NULLed out — mock data only, no real history loss.

DROP INDEX IF EXISTS appointment_clients_package_idx;

ALTER TABLE appointment_clients RENAME COLUMN package_assignment_id TO package_instance_id;
UPDATE appointment_clients SET package_instance_id = NULL;
ALTER TABLE appointment_clients
  ADD CONSTRAINT appointment_clients_package_instance_id_fk
  FOREIGN KEY (package_instance_id) REFERENCES package_instances(id) ON DELETE set null;

-- ============================================================================
-- SECTION 6: DROP LEGACY TABLES AND COLUMNS
-- ============================================================================

-- Drop package_instances.package_id column (and its FK to packages via CASCADE)
ALTER TABLE package_instances DROP COLUMN package_id;

-- Drop the 5 legacy tables. CASCADE handles:
--   - package_instances → packages FK (already dropped above)
--   - appointment_clients → package_assignments FK (orphan column stays, see Risks)
--   - service_rules → services FK
--   - service_commission_config → services FK
--   - cancelled_sales → sales_orders FK, → invoices FK
DROP TABLE IF EXISTS cancelled_sales CASCADE;
DROP TABLE IF EXISTS package_assignments CASCADE;
DROP TABLE IF EXISTS packages CASCADE;
DROP TABLE IF EXISTS service_commission_config CASCADE;
DROP TABLE IF EXISTS service_rules CASCADE;

-- ============================================================================
-- SECTION 7: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS services_expiry_days_idx ON services (expiry_days);
CREATE INDEX IF NOT EXISTS sales_orders_cancellation_number_idx ON sales_orders (cancellation_number);
CREATE INDEX IF NOT EXISTS sales_orders_cancellation_date_idx ON sales_orders (cancellation_date);
CREATE INDEX IF NOT EXISTS package_instances_service_idx ON package_instances (service_id);
CREATE INDEX IF NOT EXISTS appointment_clients_package_instance_idx ON appointment_clients (package_instance_id);

-- ============================================================================
-- SECTION 8: DRIZZLE JOURNAL SYNC
-- ============================================================================
-- After this file is applied, Phase 2 inserts a row into __drizzle_migrations
-- via a separate psql command so drizzle-kit knows this migration has been run.
-- That insert is NOT in this file (it needs a hash computed from this file's contents).

COMMIT;
```

**Notes on the SQL:**

- **Transaction wrapping:** `BEGIN; ... COMMIT;` is redundant when running with `psql -f file.sql -1` (the `-1` flag wraps the whole file in one transaction), but keeping it explicit makes the intent obvious to readers.
- **`IS NOT DISTINCT FROM`:** This is PostgreSQL's NULL-safe equality. Two NULL branch_ids compare as equal with this operator but not with `=`. Needed because some services/packages may be branch-wide (null branch_id).
- **Idempotency via `IF NOT EXISTS` and `WHERE column IS NULL`:** Each write is conditional so re-running the file on a partially-applied DB is safe (though you should never actually re-run — the legacy tables won't exist the second time).
- **Pre-flight `DO $$ ... $$` blocks:** They abort the transaction with a clear error message if preconditions aren't met. Better than discovering the problem mid-migration.
- **Post-backfill checks:** Defense in depth. If the backfill logic is wrong, these catch it before constraints are added (at which point they'd fail with cryptic FK/NOT NULL errors).
- **Section 3b (appointment_type)**: Only overrides the schema default. If someone explicitly set a service to `'private'` and wanted it to stay that way, this clobbers them. Accepted tradeoff — the alternative is losing all `appointment_type` data. Flag this in the PR description for manual review.
- **Section 3b (price)**: Only writes where `price IS NULL`. Never clobbers an explicit service price.
- **Section 5.5 renames `appointment_clients.package_assignment_id` → `package_instance_id`:** Restores per-client package credit tracking for group classes. Legacy UUID values are NULLed — mock data only.

**Acceptance:**
- File exists at `packages/db/src/migrations/0010_schema_consolidation.sql`
- All statements parsed by a local `psql --dry-run` (well, psql doesn't have dry-run, but you can validate syntax by running it inside a rolled-back transaction — see Phase 2 Task 2.2)
- Every line accounted for by one of: DDL, backfill, check, drop, index
- No `DELETE FROM` anywhere (we drop tables, we don't delete rows)

---

### Task 1.6 — Update `meta/_journal.json` to register the new migration (10 min)

**File:** `packages/db/src/migrations/meta/_journal.json`

Drizzle-kit keeps an index of migrations in this file. Each entry has `idx`, `version`, `when`, `tag`, `breakpoints`. Example existing entry (0009):

```json
{
  "idx": 9,
  "version": "7",
  "when": <unix_ms>,
  "tag": "0009_majestic_switch",
  "breakpoints": true
}
```

**Add a new entry for 0010:**

```json
{
  "idx": 10,
  "version": "7",
  "when": <unix_ms_now>,
  "tag": "0010_schema_consolidation",
  "breakpoints": true
}
```

Set `when` to the current unix timestamp in milliseconds. Commit this with the SQL file.

**Acceptance:** `bun db:generate` run after this task reports "no changes" (because the source schema and the latest migration are in sync). If it tries to generate a new 0011 with the same content as 0010, the journal is wrong — fix and retry.

---

### Task 1.7 — Rename `appointment_clients.package_assignment_id` → `package_instance_id` (MANDATORY)

**Decision:** Option A selected by user. Group classes can have multiple clients each drawing from their own pack, so per-client credit tracking at the `appointment_clients` level must work. The rename is the cleanest way to restore this capability.

**Why it matters:** The `package_assignment_id` column on `appointment_clients` currently holds UUIDs pointing at rows in the dropped `package_assignments` table. After the migration, those UUIDs point at nothing. Renaming and re-pointing at `package_instances` restores the semantics.

**Part 1 — Source schema update** (`packages/db/src/schema/tenant/appointment-clients.ts`):

Current code:
```ts
import { appointments } from "./appointments";

export const appointmentClients = pgTable("appointment_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id")
    .notNull()
    .references(() => appointments.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  packageAssignmentId: uuid("package_assignment_id"), // Legacy: references package_assignments (table removed)
  // ...
}, (table) => ({
  // ...
  packageAssignmentIdIdx: index("appointment_clients_package_idx").on(table.packageAssignmentId),
}));
```

Change to:
```ts
import { appointments } from "./appointments";
import { packageInstances } from "./package-instances";

export const appointmentClients = pgTable("appointment_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id")
    .notNull()
    .references(() => appointments.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  // Per-client package credit tracking (e.g. group class where 3 clients each use their own pack)
  packageInstanceId: uuid("package_instance_id")
    .references(() => packageInstances.id, { onDelete: "set null" }),
  // ...
}, (table) => ({
  // ...
  packageInstanceIdIdx: index("appointment_clients_package_instance_idx").on(table.packageInstanceId),
}));
```

Also update the file's JSDoc block at the top to reflect the new column name and semantics.

**Part 2 — SQL migration statements** (inserted into `0010_schema_consolidation.sql`):

These have already been embedded in Task 1.5's SQL file. Confirm Section 5.5 exists between "SECTION 5: ENFORCE NEW CONSTRAINTS" and "SECTION 6: DROP LEGACY TABLES":

```sql
-- ============================================================================
-- SECTION 5.5: RENAME ORPHAN COLUMN ON appointment_clients
-- ============================================================================
-- package_assignment_id used to FK to the dropped package_assignments table.
-- We rename it to package_instance_id and re-point at package_instances.
-- Legacy UUID values are NULLed out (they pointed at package_assignments rows
-- which are about to be dropped). Mock data only — no real history loss.

-- Drop the index on the old column name first
DROP INDEX IF EXISTS appointment_clients_package_idx;

ALTER TABLE appointment_clients RENAME COLUMN package_assignment_id TO package_instance_id;
UPDATE appointment_clients SET package_instance_id = NULL;
ALTER TABLE appointment_clients
  ADD CONSTRAINT appointment_clients_package_instance_id_fk
  FOREIGN KEY (package_instance_id) REFERENCES package_instances(id) ON DELETE set null;

CREATE INDEX appointment_clients_package_instance_idx
  ON appointment_clients (package_instance_id);
```

**Part 3 — Grep for usages in app code that need updating:**

```bash
grep -rn "packageAssignmentId\|package_assignment_id" apps packages
```

Any hit in `apps/server/` or `packages/services/` or `packages/api/` is code that reads/writes the old column name and must be updated to `packageInstanceId`. Likely candidates:
- Appointment creation logic that stores which pack the client is drawing from
- Any read paths that surface "package used" per appointment client

If the grep returns zero code hits (only docs), the rename is source-schema + migration SQL only.

**Data loss acknowledgement:** All existing per-client package-usage data in the mock DB is wiped. Acceptable per user confirmation (mock data only).

**Acceptance:**
- Source schema compiles (`bun check-types`)
- `grep -rn "packageAssignmentId" apps packages` returns only doc hits
- Section 5.5 present in `0010_schema_consolidation.sql`

---

## Phase 1 exit checklist

- [ ] `packages/db/src/schema/tenant/sales-orders.ts` has `cancelledAmount integer` column
- [ ] `packages/services/src/sales-order.service.ts` — `cancelSalesOrder` writes `cancelledAmount`, validates range
- [ ] `packages/api/src/routers/cancelled-sales.ts` — both procedures return `row.cancelledAmount ?? row.totalAmount`
- [ ] `apps/server/scripts/migrate-schema-consolidation.ts` deleted
- [ ] `packages/db/src/migrations/0010_schema_consolidation.sql` written and reviewed
- [ ] `packages/db/src/migrations/meta/_journal.json` has a 0010 entry
- [ ] `bun check-types` green
- [ ] `bun check` (biome) green
- [ ] No broken imports (grep `migrate-schema-consolidation` returns only docs)
- [ ] `appointment-clients.ts` schema renamed to `packageInstanceId` with FK to `packageInstances`
- [ ] `grep -rn "packageAssignmentId" apps packages` returns only doc hits (or zero)
- [ ] Section 5.5 present in `0010_schema_consolidation.sql`
