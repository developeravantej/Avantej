# Phase 4: Verify tests, seed scripts, and utility scripts

**Goal:** Run every automated suite and every support script that was touched by the consolidation and fix anything that regresses. Also add test coverage for the new `cancelledAmount` behaviour. End Phase 4 with a green test board and known-working seed/cleanup scripts.

**User journey this advances:** None directly. This is the safety net that protects every journey downstream from subtle breakage the schema migration might have introduced.

**Dependencies:** Phase 2 complete (dev DB is on the consolidated schema). Phase 3 complete (the web bug is fixed — otherwise vitest may fail if there's a snapshot or integration test for the instances view). Phase 1 service/router changes committed (Task 1.2, 1.3).

---

## What was touched by the consolidation

Per `docs/SCHEMA_CONSOLIDATION.md`, these files were edited in `apps/server` and `apps/web`:

| File | What changed | Risk |
|---|---|---|
| `apps/server/src/tests/unit/services/sales-order.test.ts` | `cancelSalesOrder` return shape: was `{ salesOrder, cancelledSale }`, now flat `SalesOrder`. Mocks + assertions updated. **NEW in revision 2**: must now assert that `cancelledAmount` is persisted and that invalid `refundAmount` values throw. | Medium — add new assertions per Task 4.2b |
| `apps/server/scripts/seed-business-data.ts` | Package seed inserts → service inserts with `sessionCount` | High — runtime only, no types |
| `apps/server/scripts/seed-app-data.ts` | Same | High |
| `apps/server/scripts/test-write-endpoints.ts` | References to dropped routers (`packages`, `serviceRules`, `serviceCommissionConfig`) removed | Medium — may have stale code paths |
| `apps/server/scripts/inspect-and-cleanup-test-data.ts` | References to dropped tables removed | Medium |
| `apps/web/src/__tests__/helpers/mock-client.ts` | Mock object was updated | Low — typed |
| `apps/web/src/__tests__/routes/packages.test.tsx` | Mock calls from `client.packages.*` to `client.services.*` | Low |

Plus: **every other test file in the repo**. Even if a test file was not edited, it may now fail if it transitively imports schema types or the changed services. The only way to know is to run them.

---

## Tasks

### Task 4.1 — Run server unit tests (30 min)

**Steps:**

```bash
cd apps/server
bun test:unit
```

Expected behavior: 144 unit tests pass (per `memory/MEMORY.md` — "T2=144 unit").

**If any fail:**

1. Read the failure. Common failure modes after this branch:
   - Tests that imported a type from `@avantej-core/db/schema/tenant/packages` — now broken imports
   - Tests that constructed mock rows including a `packageId` field on `package_instances` — now extra/invalid fields
   - Tests that asserted the old `cancelSalesOrder` return shape
   - Tests that called dropped services or routers directly

2. Fix the failing test. Do **not** fix by mocking-around; fix the test to reflect the consolidated schema.

3. If a test is testing a dropped feature (e.g. "package creation via packages router"), delete the test — the feature no longer exists.

**Acceptance:** `bun test:unit` reports all passing, exit code 0.

---

### Task 4.1b — Add unit test coverage for `cancelledAmount` (30 min)

**Why:** The partial-refund fix from Phase 1 Task 1.2 has no test. Add two:

**File:** `apps/server/src/tests/unit/services/sales-order.test.ts`

```ts
describe("cancelSalesOrder — cancelledAmount persistence", () => {
  test("writes refundAmount to cancelled_amount column", async () => {
    // Arrange: mock a sales order with totalAmount = 10000
    const mockOrder = { id: "so1", totalAmount: 10000, status: "confirmed" };
    mockTenantDb.query.salesOrders.findFirst.mockResolvedValue(mockOrder);
    mockTenantDb.update.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ ...mockOrder, cancelledAmount: 5000 }]),
    });

    // Act
    const result = await cancelSalesOrder(mockTenantDb, "so1", {
      cancelledBy: "user-1",
      refundAmount: 5000,  // partial
    });

    // Assert
    const setCall = mockTenantDb.update.mock.results[0].value.set.mock.calls[0][0];
    expect(setCall.cancelledAmount).toBe(5000);
    expect(result.cancelledAmount).toBe(5000);
  });

  test("throws when refundAmount exceeds totalAmount", async () => {
    mockTenantDb.query.salesOrders.findFirst.mockResolvedValue({
      id: "so1", totalAmount: 10000, status: "confirmed",
    });

    await expect(
      cancelSalesOrder(mockTenantDb, "so1", { cancelledBy: "user-1", refundAmount: 20000 })
    ).rejects.toThrow(/out of range/);
  });

  test("throws when refundAmount is negative", async () => {
    mockTenantDb.query.salesOrders.findFirst.mockResolvedValue({
      id: "so1", totalAmount: 10000, status: "confirmed",
    });

    await expect(
      cancelSalesOrder(mockTenantDb, "so1", { cancelledBy: "user-1", refundAmount: -100 })
    ).rejects.toThrow(/out of range/);
  });
});
```

**Acceptance:** Three new tests pass. Add to the unit-test count (145 total).

---

### Task 4.2 — Run server integration tests (45 min)

**Prerequisites:** Dev DB is on the consolidated schema (Phase 2 done).

**Steps:**

```bash
cd apps/server
bun test:integration
```

Expected: 46 integration tests pass.

**If any fail:**

1. Integration tests hit the real dev DB. A common failure mode is that a test seeded `packages` or `cancelled_sales` rows in its `beforeEach` — those inserts will now fail because the tables are gone.

2. Find the offending `tenantDb.insert(packages)` / `tenantDb.insert(cancelledSales)` calls (they'll be compile errors, not runtime errors, because the schema imports are gone).

3. Rewrite each to insert into the new schema. For packages: insert into `services` with `sessionCount` set. For cancelled_sales: create a `sales_orders` row with `status: 'cancelled'` and the cancellation columns populated.

4. Check `apps/server/src/tests/helpers/fixtures.ts` — if there's a `createTestPackage` or `createTestCancelledSale` factory, rewrite it.

**Acceptance:** `bun test:integration` is green.

---

### Task 4.3 — Run web frontend tests (30 min)

**Steps:**

```bash
cd apps/web
bun test
```

Expected: 76 frontend tests pass (per `memory/MEMORY.md` — "T4=76 frontend").

**If any fail:**

1. The most likely failure is in `packages.test.tsx` — the doc claims it was updated, but verify.
2. Other files in `apps/web/src/__tests__/**` may reference `client.packages.*` or types from deleted modules. Fix as needed.

**Acceptance:** `cd apps/web && bun test` exits 0.

---

### Task 4.4 — Dry-run `seed-business-data.ts` (30 min)

**Why:** Seed scripts were edited to write services instead of packages. They haven't been run since. Best way to verify: run them against the dev DB and spot-check the result.

**Steps:**

1. Confirm the dev DB is in a known state (either freshly migrated from Phase 2, or already seeded).

2. Run the script:
   ```bash
   cd apps/server
   bun run scripts/seed-business-data.ts
   ```

3. Expect no errors. If it throws:
   - Likely cause: a `tenantDb.insert(packages).values(...)` call that wasn't migrated. The import will have failed to resolve, so it's a compile error.
   - Fix: rewrite as `tenantDb.insert(services).values({ ..., sessionCount: N, expirable: true, expiryDays: 30, ... })`.
   - Also check for any `packageInstances` inserts that use `packageId` — they now need `serviceId`.

4. Spot-check:
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM services WHERE session_count > 0;"
   # Should be > 0 if the seed script inserted "packages" (= services with sessionCount)
   ```

**Acceptance:** Script exits 0 and seeded rows exist in `services` with `session_count > 0`.

---

### Task 4.5 — Dry-run `seed-app-data.ts` (30 min)

Same process as Task 4.4, same expected outcome. The comment at the top of the file (`* - More packages with varied pricing`) indicates this script also inserts packages.

**Acceptance:** Script exits 0, additional services/package-instances present in the dev DB.

---

### Task 4.6 — Read-through of `test-write-endpoints.ts` (45 min)

**File:** `apps/server/scripts/test-write-endpoints.ts`

**Why:** The doc says this script "removed references to dropped routers" — a surgical edit. Verify that the remaining code still makes sense and doesn't have dead branches.

**How:**

1. Open the file and read every function top-to-bottom.
2. Look for:
   - `client.packages.*` calls — should all be gone; any that remain are bugs
   - `client.serviceRules.*` / `client.serviceCommissionConfig.*` — same
   - Empty function bodies, early `return`s with no side effect, commented-out blocks — dead code
   - Helper functions that are no longer called — dead code, safe to delete
3. If the script runs as part of CI or a dev workflow, execute it to verify:
   ```bash
   cd apps/server
   bun run scripts/test-write-endpoints.ts
   ```
4. If it's purely manual-use and is in a broken state, either fix it or document the known-broken paths at the top of the file.

**Acceptance:** No stale `client.packages.*` or dropped-router calls remain. If the script is runnable, it runs cleanly against the dev server.

---

### Task 4.7 — Read-through of `inspect-and-cleanup-test-data.ts` (45 min)

**File:** `apps/server/scripts/inspect-and-cleanup-test-data.ts`

Same process as Task 4.6. This script likely queries test data for inspection and deletion; confirm it no longer references dropped tables.

**Key thing to check:** If the script has a `cleanupPackages()` or `cleanupCancelledSales()` function that iterates the tables and deletes rows, that function is now either (a) obsolete (delete it) or (b) needs to be rewritten to clean up services with `sessionCount > 0` and sales_orders with `status = 'cancelled'`.

**Acceptance:** Script type-checks and runs (if runnable) without referencing dropped tables.

---

### Task 4.8 — Run `bun check` and `bun check-types` across the repo (15 min)

**Why:** Catch anything the test suites didn't notice — unused imports, stale type references, Biome style issues.

```bash
bun check          # Biome linting
bun check-types    # TypeScript check
```

**Acceptance:** Both exit 0.

---

### Task 4.9 — Update the 0007_short_korath embedded tenant migration (if applicable) (1 hour — DEFER OR FLAG)

**File:** `packages/db/src/migrate-tenant.ts`

**Why flagged:** Newly provisioned tenant databases run a sequence of embedded SQL migration strings. The latest is currently `0007_short_korath`. After Phase 2 generates `0010_*.sql` in `src/migrations/`, fresh tenants will still get the pre-consolidation schema because `migrate-tenant.ts` doesn't know about `0010_*.sql` yet.

**What to decide:**

- **Defer:** Mark this as a follow-up. New tenants provisioned between this merge and the follow-up will have legacy tables. They'll need a one-off migration script when the follow-up lands. Acceptable if no new tenants are expected in that window.
- **Include in this plan:** Add a new embedded migration string `MIGRATION_0008_SCHEMA_CONSOLIDATION` to `migrate-tenant.ts` containing the same SQL that `0010_*.sql` contains (copy-paste from the file generated in Task 2.3). Wire it into the migration orchestrator the same way `MIGRATION_0007_SHORT_KORATH` is wired.

**The user said this is "slightly out of scope but should be flagged."** Flagging it here. The recommendation is: **defer** unless the team plans to provision new tenant DBs on this branch. If deferred, create a follow-up issue titled "Update migrate-tenant.ts with schema consolidation SQL" and link it in the PR description.

**Acceptance:** A decision is recorded. Either:
- A follow-up ticket exists and is linked in the PR description, OR
- `MIGRATION_0008_SCHEMA_CONSOLIDATION` is added to `packages/db/src/migrate-tenant.ts` with content copied from `0010_*.sql`

---

## Phase 4 exit checklist

- [ ] `cd apps/server && bun test:unit` green
- [ ] `cd apps/server && bun test:integration` green
- [ ] `cd apps/web && bun test` green
- [ ] `bun run scripts/seed-business-data.ts` ran cleanly
- [ ] `bun run scripts/seed-app-data.ts` ran cleanly
- [ ] `test-write-endpoints.ts` read-through complete, no stale calls
- [ ] `inspect-and-cleanup-test-data.ts` read-through complete, no stale references
- [ ] `bun check` + `bun check-types` green
- [ ] `migrate-tenant.ts` decision recorded (defer or include)
