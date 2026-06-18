# Schema Drift Audit
**Session:** 06-05_18-18_next-steps-cleanup-commit-suite-ci
**Findings:** 4 (0 critical · 0 high · 0 medium · 0 low · 4 info)

## Findings

### [INFO] No schema files or migrations touched by the plan
**Plan claims:** "Do not change tenant migration files or the generated migrations module." Schema, migrations, and `tenant-migrations.generated.ts` are OUT OF SCOPE. No new tables/columns/FKs/enums.
**Actual:** Confirmed. The 5 in-scope files (`commission-diff-harness.test.ts`, `installment-plan.test.ts`, `installment.test.ts`, `db-mock.factory.ts`, `orpc-tenant.middleware.ts`) contain ZERO imports from `packages/db/src/schema/` of an additive nature, and none reference migration files. The only schema imports in scope are the two pre-existing ones in the middleware (`members`, `organizations`), which the refactor preserves rather than alters. No-schema-impact confirmed — the expected outcome for a test-refactor plan.
**File:** zplan/06-05_18-18_next-steps-cleanup-commit-suite-ci/prompts/06-05_18-33_server-holding-it-back.md
**Fix:** None required.
---
### [INFO] Middleware schema column references all exist — safe to preserve through Task C consolidation
**Plan claims:** Task 5 consolidates public-endpoint detection + gates console.log in `orpc-tenant.middleware.ts`; the column references must survive the edit.
**Actual:** All three referenced columns verified present in the live Drizzle schema:
- `organizations.paymentStatus` → `payment_status text NOT NULL` (organizations.ts:28), used at middleware:133,156–157,161–164.
- `members.userId` → `user_id text NOT NULL` (members.ts:31), used at middleware:235.
- `members.hierarchyScopeId` → `hierarchy_scope_id uuid NOT NULL` (members.ts:37), used at middleware:242.
The Task 5 work is logging/branch-consolidation only and does not move or rename these. No drift.
**File:** apps/server/src/middleware/orpc-tenant.middleware.ts:133,235,242
**Fix:** None required — preserve the column references verbatim during consolidation.
---
### [INFO] Test mock query-table names all map to real schema tables
**Plan claims:** Task C centralizes `selectChainResolving`/`sel` into `db-mock.factory.ts`; mock shapes must stay valid.
**Actual:** All 18 `query.{table}` keys in `createMockTenantDb()` (installmentPlans, installments, installmentEvents, packageInstances, members, hierarchyNodes, salesOrders, appointments, expenses, announcements, classSlots, memberProfiles, waitlistEntries, commissionSplits, purchaseOrders, purchaseOrderItems, promotions, promotionUsages, walkInCustomers, taxRates) correspond to existing files under `packages/db/src/schema/tenant/`. These are plain JS mock property names (not Drizzle imports), so even a stale name would be a no-op, not a schema change. No phantom tables.
**File:** apps/server/src/tests/helpers/db-mock.factory.ts:99–120
**Fix:** None required.
---
### [INFO] commission-diff-harness `sel`/`switch(n)` builders reference only column literals, not schema objects
**Plan claims:** Task A rewrites the positional `switch(n)` select-counter into named/labeled selectors.
**Actual:** The `buildA*Db`/`buildP*Db` builders return hand-rolled row literals (e.g. `{ categoryId, paymentType, isConditional }`, `{ trainerTierId, weightageBasisPoints }`) through the local `sel()` helper. They import no schema tables — `createMockTenantDb` and `node:fs`/`node:path` only (lines 31–35). The field names mirror commission-track/condition/rate columns but are untyped string keys; refactoring the dispatch mechanism cannot introduce schema drift. The only correctness risk is the golden-fixture byte-match, which is test-internal, not schema.
**File:** apps/server/src/tests/unit/services/commission-diff-harness.test.ts:71–554
**Fix:** None required — schema-neutral.
---
## Summary
This is a pure test-quality/middleware-logging refactor with zero schema surface. No new tables, columns, FKs, migrations, or enums are proposed, and none are implicitly required. The only schema touchpoints in scope are the two pre-existing imports in `orpc-tenant.middleware.ts` (`members`, `organizations`), and all three columns the middleware reads — `organizations.paymentStatus`, `members.userId`, `members.hierarchyScopeId` — are confirmed present in the current Drizzle schema, so the Task 5 consolidation can preserve them safely. All 18 mock query-table names in `db-mock.factory.ts` map to real tenant schema files, and the commission harness builders use untyped row literals with no schema imports. Drift risk: none. Expected INFO-only outcome confirmed.
