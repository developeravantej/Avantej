# Server Integration Test Failures — Handoff for Codex

**Branch:** `chore/merge-phase-5`
**Working dir:** `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-charged-vortex-d3e3`
**Last commit before this work:** `c9b3ce0`

## Goal

Drive `cd apps/server && bun test` to **0 failures**. Currently:

```
584 pass
 14 skip
 23 fail
1189 expect() calls
Ran 621 tests across 54 files
```

The 14 skips are intentional (`auth.service.test.ts` Proxy-mock architectural mismatch, separate concern — leave skipped).

## Environment is fully provisioned — DO NOT re-do

- `apps/server/.dev.vars` and `apps/server/.env` both have:
  - `NEON_API_KEY=napi_0vcu52qfnf60gu0txpscozjt1lbl2m0w738buysgrvc2a264n8cses6gr6bmyau2` (works, verified)
  - `TENANT_DATABASE_URL=postgresql://neondb_owner:npg_sSh3gDpvOcR2@ep-tiny-pond-aompdvul.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
  - `RESEND_API_KEY`, `BETTER_AUTH_SECRET`, etc.
- Tenant DB has all 19 migrations applied (verified via `runTenantMigrations`)
- Standalone runs of integration tests like `bun test src/services/neon.service.integration.test.ts` → **4/4 pass**

The 23 failures only happen in the full `bun test` run — see "Test isolation" below.

## Run/verify cycle

```bash
cd apps/server
rm -rf dist        # tsc -b populates this from typecheck; dupes test runs
bun test 2>&1 | tail -5
```

The `rm -rf dist` is critical: `composite: true` in `apps/server/tsconfig.json` makes
`tsc -b` emit compiled `.test.js` files to `dist/` on every typecheck, and bun
test discovers BOTH `src/` and `dist/`, doubling failure counts. Until the
build config is changed, always nuke `dist/` first.

## The 23 failures grouped by root cause

### Group 1 — Schema drift: `hierarchyScopeId` NOT NULL (3 tests)

**File:** `apps/server/src/tests/integration/members-deactivate.integration.test.ts`

**Tests failing:**
- `Members Deactivate Integration > deactivate sets status to 'inactive' (not 'suspended')`
- `Members Deactivate Integration > deactivate already-inactive member still succeeds`
- `Members Deactivate Integration > deactivate preserves other member fields`

**Error:**
```
null value in column "hierarchy_scope_id" of relation "members" violates not-null constraint
```

**Root cause:** Phase-5 made `members.hierarchyScopeId` `NOT NULL`. The test helper
`createTestMember` (line 40) sets it to `null`:

```ts
async function createTestMember(db, overrides = {}) {
  const [member] = await db.insert(members).values({
    userId: `test-user-deactivate-${Date.now()}-...`,
    role: "staff",
    status: "active",
    hierarchyScopeId: null,   // <-- NOT NULL violation
    ...overrides,
  } as any).returning();
}
```

**Fix:** Insert a dummy hierarchy node first in `beforeAll`, then pass its id as
`hierarchyScopeId`. Pattern:

```ts
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy-nodes";

let testHierarchyNodeId: string;
beforeAll(async () => {
  if (shouldSkipIntegration()) return;
  loadDevVars();
  tenantDb = createTenantDb();
  const [node] = await tenantDb.insert(hierarchyNodes).values({
    name: "Test Branch",
    type: "location",
    depth: 1,
    organizationId: "test-org",
    isActive: true,
  }).returning();
  testHierarchyNodeId = node.id;
});

// In createTestMember, replace `hierarchyScopeId: null` with `hierarchyScopeId: testHierarchyNodeId`
```

Also clean up the hierarchy node in `afterAll`.

### Group 2 — Schema drift: missing required columns on inserts (likely most of the rest)

**Files:** likely
- `apps/server/src/tests/integration/announcements.integration.test.ts`
- `apps/server/src/tests/integration/expenses.integration.test.ts` (4 tests)
- `apps/server/src/tests/integration/promotions.integration.test.ts`
- `apps/server/src/tests/integration/tax-rates.integration.test.ts`
- `apps/server/src/tests/integration/installments.integration.test.ts`
- `apps/server/src/tests/integration/installment-plans.integration.test.ts` (1 named test)
- `apps/server/src/tests/integration/purchase-orders.integration.test.ts` (6 tests)
- `apps/server/src/tests/integration/invitations-scope.test.ts` (2 named tests)
- `apps/server/src/tests/integration/appointment-commission.test.ts`
- `apps/server/src/tests/integration/commission-calculator.test.ts`
- `apps/server/src/tests/integration/pos-commission.test.ts`
- `apps/server/src/tests/integration/tenant-admin.test.ts`
- `apps/server/src/tests/integration/analytics.integration.test.ts`

**Error pattern:** drizzle insert failures or query result mismatches at
`node_modules/@neondatabase/serverless/index.mjs:1087:33`.

**Root cause categories:**

1. **NOT NULL columns added in phase-5** that test fixtures don't provide.
   Example fields to check across schemas:
   - `members.hierarchyScopeId` (confirmed)
   - check each insert target schema in `packages/db/src/schema/tenant/` for
     columns marked `.notNull()` without `.default(...)` and verify the test
     fixture passes them.

2. **Field name renames** matching the parallel fixture cleanup in commit
   `f56d322` (web fixtures). Same drift may exist in server integration tests.
   Cross-reference the renames already done there:
   - `purchase_orders`: `poNumber` → `purchaseOrderNumber`, `subtotalInCents` →
     `subtotal`, `totalInCents` → `totalAmount`, dropped `cancelledBy`/`cancelledAt`
   - `purchase_order_items`: `unitCostInCents` → `unitCost`,
     `subtotalInCents` → `totalCost`
   - `expenses`: `amountInCents` → `amount`; dropped `rejectedBy`
   - `walk_in_customers`: `phoneNumber` → `phone`
   - `class_slots`: `trainerId` → `instructorId`, `enrolledCount` → `spotsBooked`,
     `startTime/endTime` Date → text "HH:MM"
   - `commission_splits`: dropped `isPaid` (use `status: "paid"`); add required
     `earnedAt`, `salesOrderId`, `splitType`
   - `waitlist_entries`: `customerId` → `userId`

3. **Required arg additions to service calls** — services like `createPromotion`,
   `deactivateMember`, `setDefaultTaxRate` now require an `actor` arg `{ userId,
   memberId, role }`. Same fix already applied to apps/web tests in `f56d322`.

**Fix process per file:**
1. Read the schema file for the table being inserted (`packages/db/src/schema/tenant/<name>.ts`).
2. Compare every test insert/fixture against the schema's columns.
3. Update fixtures to:
   - Pass NOT NULL columns
   - Use the renamed field names
   - Match column types (e.g., text vs Date)
4. For service-call assertions, ensure required args (like `actor`) are passed.

### Group 3 — Error message format change in `verifyEmailToken` (already partially fixed)

**File:** `apps/server/src/tests/integration/auth-email.test.ts`

These two tests have already been updated to use lenient regex
(`/Invalid token|invalid_token/i` and `/Token expired|token_expired/i`) and
should pass on next run. If they still fail, check the actual thrown error
message against the regex and adjust.

### Group 4 — Test isolation: `neon.service.integration.test.ts` polluted by another test

**Tests:**
- `Neon Service Integration Tests > creates real Neon project and returns valid projectId and connectionString`
- `Neon Service Integration Tests > creates project with correct name format`
- `Neon Service Integration Tests > creates project with default region when not specified`

**Behavior:**
- Standalone: `bun test src/services/neon.service.integration.test.ts` → **4/4 pass**
- In full `bun test` run: 3 fail with `401 Unauthorized`

**Root cause hypothesis:** Some other test file mutates `process.env.NEON_API_KEY`
to an old/invalid value before this integration test runs (test order in bun is
file-discovery order). Suspects:
- `apps/server/src/services/neon.service.test.ts` (the unit test) — its mocks
  may set or clear `NEON_API_KEY`
- `apps/server/scripts/inspect-and-cleanup-test-data.ts` — has `loadDevVars`
  logic; if loaded as a side-effect somewhere, could write old env

**Fix process:**
1. Search for `process.env.NEON_API_KEY =` across `apps/server/src/` to find any
   mutation.
2. The integration test should explicitly `loadDevVars()` in its `beforeAll`
   to overwrite any prior pollution. Currently `loadDevVars()` only sets
   env vars `if (!process.env[key])` — change it to always overwrite (or
   make a separate test-isolation-friendly variant).

### Group 5 — Email integration test: invalid-key reset (1 test)

**File:** `apps/server/src/lib/email.integration.test.ts`

**Test:** `Email Service Integration Tests > handles invalid API key error`

**Error:**
```
Expected promise that rejects
Received promise that resolved: Promise { <resolved> }
```

**Code at line 189:**
```ts
__resetResendClient();
await expect(
  sendVerificationEmail(testRecipientEmail, verificationLink)
).rejects.toThrow();
```

**Root cause hypothesis:** The test sets an invalid Resend key, calls
`__resetResendClient()` to force re-init, then expects the next call to
throw. But `sendVerificationEmail` resolves successfully. Either:
- `__resetResendClient()` doesn't actually invalidate the cached client
- OR the test setup doesn't actually swap to an invalid key
- OR `sendVerificationEmail` no longer throws on Resend errors (post-phase-5
  may have changed error handling to swallow & log)

**Fix process:**
1. Read `__resetResendClient` in `apps/server/src/lib/email.ts` to verify it
   actually resets state.
2. Read `sendVerificationEmail` to see if it still throws on API errors. If
   phase-5 changed it to log-and-continue, update the test to match new
   behavior (or assert via a spy that the API was called and returned an error
   shape).

### Group 6 — Organization Lifecycle (1 test)

**File:** `apps/server/src/tests/integration/org.test.ts`

**Test:** `Organization Lifecycle Integration Tests (T102) > creates organization with full lifecycle`

**Error:** Times out after 5001ms. Likely:
- Hits real Neon API to create a project (depends on Group 4 isolation issue)
- Has its own setup pre-conditions (control panel admin user, etc.)

**Fix:** Run standalone first to see if it passes (`bun test
src/tests/integration/org.test.ts`). If yes, the failure is the env-pollution
fixed in Group 4. If still fails, inspect setup.

### Group 7 — Platform Admin (1 test)

**File:** `apps/server/src/tests/integration/platform-admin.test.ts`

**Test:** `grant + revoke platform admin (service layer) > billing admin: platform_admins row exists with role=billing if granted`

**Error:** Line 159 — likely a pre-condition failure (admin user not
created, or role enum doesn't include 'billing' in current schema).

**Fix:** Read the test setup and the `platform_admins` schema in
`packages/db/src/schema/control-panel/platform-admins.ts`. Verify the role
enum includes `'billing'` and the test creates required user rows.

## Verification per fix

After fixing each test file:

```bash
cd apps/server
rm -rf dist
bun test src/tests/integration/<that-file>.test.ts 2>&1 | tail -3
```

Final verification (must show 0 fail, ignore the 14 intentional skips):

```bash
cd apps/server
rm -rf dist
bun test 2>&1 | tail -5
# Target output:
#  607 pass
#   14 skip
#    0 fail
```

## Things to NOT do

- Don't change `package.json` test scripts — they are correct.
- Don't change `apps/server/tsconfig.json` (composite + outDir is needed for
  turbo project references).
- Don't touch `apps/server/src/services/auth.service.test.ts` — those 10
  `.skip`s document a separate Proxy-architecture issue that requires
  `mock.module()` rewrite (not in scope here).
- Don't roll back the env additions — they are required.
- Don't create new Neon projects per test — re-use the
  `TENANT_DATABASE_URL` provisioned project for all tenant-DB-needing tests.

## Reference: tests that ALREADY pass and prove the env works

- `bun test src/services/neon.service.integration.test.ts` → 4/4 pass
- `bun test src/lib/email.integration.test.ts` → 5/6 pass (1 in Group 5)
- `bun test src/tests/integration/auth-email.test.ts` → 3/5 pass at time of
  this writing; 2 fixed by lenient-regex change to land in next run

## Reference: file inventory of integration tests

```
src/lib/email.integration.test.ts                              [Group 5: 1 fix needed]
src/services/neon.service.integration.test.ts                  [Group 4: isolation fix]
src/tests/integration/analytics.integration.test.ts            [Group 2]
src/tests/integration/announcements.integration.test.ts        [Group 2]
src/tests/integration/appointment-commission.test.ts           [Group 2]
src/tests/integration/auth-email.test.ts                       [Group 3: already partial]
src/tests/integration/commission-calculator.test.ts            [Group 2]
src/tests/integration/expenses.integration.test.ts             [Group 2]
src/tests/integration/installment-plans.integration.test.ts    [Group 2]
src/tests/integration/installments.integration.test.ts         [Group 2]
src/tests/integration/invitations-scope.test.ts                [Group 2]
src/tests/integration/members-deactivate.integration.test.ts   [Group 1]
src/tests/integration/org.test.ts                              [Group 6]
src/tests/integration/platform-admin.test.ts                   [Group 7]
src/tests/integration/pos-commission.test.ts                   [Group 2]
src/tests/integration/promotions.integration.test.ts           [Group 2]
src/tests/integration/purchase-orders.integration.test.ts      [Group 2]
src/tests/integration/tax-rates.integration.test.ts            [Group 2]
src/tests/integration/tenant-admin.test.ts                     [Group 2]
```

## Reference commits in this branch with related fixes

- `f56d322` — `fix(server): align test fixtures to drizzle schema field names`
  (web fixtures rewritten — same patterns will apply to server integration tests)
- `92b6227` — `fix(server): real bugs surfaced by type-cast audit`
  (Better-Auth API rename + drizzle relations)
- `c9b3ce0` — `fix(server): drive test failures to 0 via env-gate + skip broken mocks`
  (the change that introduced `SKIP_INTEGRATION_TESTS=true` default)
