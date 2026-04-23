## Agent: Agent 1A (backend) — Phase 1
**Completed:** 2026-04-23T00:00:00.000Z

### What I Did
- `packages/services/src/installment.service.ts`: Added `sql` to drizzle-orm imports
- `packages/services/src/installment.service.ts`: Extended `AdminInstallmentOverviewParams.status` type to include `"due_soon"`
- `packages/services/src/installment.service.ts`: Extended `AdminInstallmentOverviewItem` type with optional `nextInstallmentAmount?: number | null` and `nextInstallmentId?: string | null`
- `packages/services/src/installment.service.ts`: Added `due_soon` filter branch in `getAdminInstallmentOverview` with `eq(isLocked, false)`, `isNull(gracePeriodEndsAt)`, `isNotNull(nextDueDate)`, `gte(nextDueDate, now)`, `lte(nextDueDate, in14d)`
- `packages/services/src/installment.service.ts`: Added batch-fetch of next pending/overdue installment after packageInstances query — single IN query ordered ASC, first-per-package via Map
- `packages/services/src/installment.service.ts`: Replaced unbounded full-fetch count (~lines 943-947) with `SELECT COUNT(*)::int` aggregate using same WHERE conditions
- `packages/api/src/routers/installments.ts`: Extended `adminOverview` Zod enum to include `"due_soon"`
- `apps/server/src/tests/unit/services/installment.test.ts`: Added import for `getAdminInstallmentOverview` and `createMockTenantDb`; added `describe("due_soon filter")` block with 4 test cases

DONE: #1
DONE: #2
DONE: #3
DONE: #4
DONE: #5

### Decisions Made
- Used `countRows[0]?.count ?? 0` instead of destructuring `[{ count }]` to satisfy TypeScript's strict null checks (array may be empty per the type signature, even though COUNT(*) always returns a row)
- For tests (b)/(c)/(d), mocked `packageInstances.findMany` to return `[]` to simulate SQL-level exclusion — the mock DB doesn't execute WHERE clauses, so this is the correct approach per advisor guidance
- Added inline `db.query.packageInstances` / `db.query.services` overrides on `createMockTenantDb()` result since those tables are absent from the factory (factory is not in owned files and was not modified)
- Used a `selectCallCount` counter on the `db.select` mock to distinguish between the batch installments query (returns `[]`) and the COUNT aggregate query (returns `[{ count: N }]`) — necessary because both go through `db.select`
- `or()` in the batch installments WHERE clause uses the same biome-ignore non-null assertion pattern already established in the file

### Issues Encountered
- `invitation.service.ts` had a pre-existing type error unrelated to my changes; confirmed by checking which files were modified

### Type-check
- PASS — `packages/services` and `packages/api` are clean. The only error visible after changes is a pre-existing `invitation.service.ts` issue not introduced by this work. All `installment.service.ts` errors resolved.

---

## Agent: Agent 1B (frontend) — Phase 1
**Completed:** 2026-04-23T13:58:00.000Z

### What I Did
- `apps/web/src/components/pages/packages/installments-page.tsx`: Extended `statusFilter` state union to include `"due_soon"`.
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added `{ value: "due_soon" as const, label: "Due Soon" }` to `STATUS_TABS` array, placed between Active and Overdue.
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added conditional "Next Amount" `<TableHead>` column when `statusFilter === "due_soon"`.
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added conditional "Next Amount" `<TableCell>` in row rendering — reads `nextInstallmentAmount` via `(row as { nextInstallmentAmount?: number | null })` cast (tolerated until Agent 1A types are available); renders `formatPrice(amount, "MYR")` when non-null, `"—"` when null.
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added conditional skeleton cell and updated empty-state `colSpan` to 7 when `statusFilter === "due_soon"`.
- `apps/web/src/__tests__/helpers/mock-client.ts`: Added `installments` namespace (`adminOverview`, `listByPackageInstance`, `confirmPayment`, `manualUnlock`, `adjustCredits`, `suggestRefund`) and `installmentPlans` namespace (`list`) to the shared mock.
- `apps/web/src/__tests__/pages/packages/installments-page.test.tsx`: Created (directory created first). 5 tests: tab rendering, Due Soon click → `adminOverview` called with `status: "due_soon"`, Next Amount column header visibility, amount rendered when present, em-dash when null.
DONE: #6
DONE: #7
DONE: #8

### Decisions Made
- Used `(row as { nextInstallmentAmount?: number | null })` type cast in the row renderer instead of `as any`. This is safe: the field is either present from Agent 1A's backend work or absent (undefined → renders "—"). The plan contract says to use optional chaining and not add the field directly.
- The test file imports `PackageInstallmentsPage` directly (not via a route file) since the component is a named export from the page module, not a TanStack Router route component — this avoids the `createFileRoute` mock pattern used in other tests.
- Added `RequestRefundDialog` mock in the test to prevent network calls from that component's internal queries.

### Issues Encountered
- The Edit tool initial attempt for the row cells failed because the actual indentation used tabs-inside-tabs (the file uses actual tabs); fixed by reading offset+limit to get the exact content before retrying.
- Pre-existing type errors in the web package (trainer-sidebar.tsx, waitlist-panel.tsx, etc.) are unrelated to my changes and were present before this work.

### Type-check
- PASS (web) — `apps/web` check-types emits zero errors in `installments-page.tsx` or `mock-client.ts`. All errors shown are pre-existing in unrelated files.

---

## Agent: Agent 2 (frontend) — Phase 2
**Completed:** 2026-04-23T14:15:00.000Z

### What I Did
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added `daysFromNow(date: Date | string): number` pure helper (Math.ceil of ms difference / day-ms) at module top, after `formatDate`.
- `apps/web/src/components/pages/packages/installments-page.tsx`: Enhanced existing `nextDueDate` row in the Package Info grid to also display `nextInstallmentAmount` when non-null — appended as ` (RM X.XX)` using `formatPrice(..., "MYR")`.
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added new `gracePeriodEndsAt` row in the Package Info grid — shows date in `text-amber-700` plus a muted `(N days remaining)` sub-span using `daysFromNow`.
- Both new fields accessed via safe `(selectedInstance as { field?: ... })` casts to tolerate the inferred `InstallmentOverviewItem` type until backend types include them.
DONE: #9

### Decisions Made
- `nextInstallmentAmount` and `gracePeriodEndsAt` are not in the `InstallmentOverviewItem` inferred type yet (pending Phase 1 backend deployment). Used the same `(row as { field?: ... | null })` cast pattern already established by Agent 1B for `nextInstallmentAmount` in the table rows — consistent with existing pattern in the file.
- `gracePeriodEndsAt` is already used in `getInstanceStatus` via `instance.gracePeriodEndsAt` (line 85 in original), confirming it IS on the type. However, a cast was still needed for the `Date | string` parameter type of `daysFromNow`.
- The `formatDate` and `formatPrice` imports were already present — no new imports needed.

### Issues Encountered
- None. The existing `nextDueDate` row in the sheet was a stub (no amount shown). The `gracePeriodEndsAt` field is already referenced in `getInstanceStatus`, confirming it is on the type.

### Type-check
- PASS — zero errors in `installments-page.tsx`. All other errors in the output are pre-existing in unrelated files (package-instances.ts, payouts.ts, service-members.ts, auth/src/index.ts).

---

## Agent: Agent 3 (backend) — Phase 3
**Completed:** 2026-04-23T15:00:00.000Z

### What I Did
- `packages/db/src/schema/tenant/package-instances.ts`: Added `allowCreditOverdraft: boolean("allow_credit_overdraft").default(false).notNull()` between `creditsAdminOverride` and `createdAt`, with the plan-specified comment.
- `packages/db/src/schema/tenant/installment-events.ts`: Added inline comment above `eventType` column listing all known eventType values, including new `overdraft_enabled` and `overdraft_disabled`.
- `packages/db/src/migrations/tenant/0016_worried_wolfpack.sql`: Generated by running `bunx drizzle-kit generate --config=drizzle.tenant.config.ts` from `packages/db/`.
- `packages/db/src/migrate-tenant.ts`: Added `MIGRATION_0016_WORRIED_WOLFPACK` const (SQL embedded verbatim from generated file) before the `TENANT_MIGRATIONS` array; appended `{ hash: "0016_worried_wolfpack", sql: MIGRATION_0016_WORRIED_WOLFPACK }` as the last item in the array.
DONE: #10
DONE: #11 (generated migration file: 0016_worried_wolfpack.sql)
DONE: #12 (0 previously-missing constants — all 0016–0029 consts were already in the array; appended new 0016_worried_wolfpack entry)
DONE: #13
DONE: #14

### Migration file contents
```sql
ALTER TABLE "expenses" ALTER COLUMN "currency" SET DEFAULT 'myr';--> statement-breakpoint
ALTER TABLE "package_instances" ADD COLUMN "allow_credit_overdraft" boolean DEFAULT false NOT NULL;
```

Note: The `expenses` currency default change reflects a pre-existing schema drift that drizzle-kit detected alongside the new column. Both statements are correct and safe.

### TENANT_MIGRATIONS array audit
- Before: constants defined = [0000–0019, 0022–0029, 0015_ABNORMAL_ABSORBING_MAN], array entries = [0000–0019, 0022–0029, 0015_abnormal_absorbing_man] (no 0020 or 0021 constants exist — those numbers were never created, not missing)
- Missing from array before my fix: NONE — all defined constants were already in the array
- After: array entries = [0000–0019, 0022–0029, 0015_abnormal_absorbing_man, 0016_worried_wolfpack]

### Decisions Made
- The drizzle generate command is `bunx drizzle-kit generate --config=drizzle.tenant.config.ts` run from `packages/db/` (not the `bun --filter` turborepo form, which doesn't match the package scripts).
- The migration SQL was embedded verbatim from the generated `.sql` file. The `-->statement-breakpoint` drizzle-kit comment is stripped in the embedded const since the runtime runner executes raw SQL directly (consistent with all other migration consts in the file).
- The new array entry was appended LAST, after `0015_abnormal_absorbing_man`, to preserve chronological application order.

### Issues Encountered
- `bun --filter @avantej-core/db db:generate:tenant` failed with "No packages matched the filter" because the package.json only has `db:generate` (not `db:generate:tenant`). Used the direct `bunx drizzle-kit generate --config=drizzle.tenant.config.ts` command instead, as documented in the `drizzle.tenant.config.ts` file header.

### Type-check
- PASS — `bun check-types` reports zero errors in `packages/db/src/schema/tenant/package-instances.ts`, `packages/db/src/schema/tenant/installment-events.ts`, or `packages/db/src/migrate-tenant.ts`. All other errors in the output are pre-existing in unrelated files (`scripts/`, `better-auth.ts`, `middleware/`, etc.).

### Note to user
- Migration has NOT been applied to any tenant DB. User must run the migration step manually per `docs/TENANT_MIGRATION_WORKFLOW.md` before Phase 4. Recommended sequence:
  1. `cd apps/server && bun run scripts/migrate-all-tenants.ts --dry-run` to see which tenants need it
  2. `bun run scripts/migrate-all-tenants.ts --concurrency=1` to apply

---

## Agent: Agent 4 (backend) — Phase 4
**Completed:** 2026-04-23T17:30:00.000Z

### What I Did
- `packages/services/src/installment.service.ts`: Added `setPackageOverdraft` function — transactional, idempotent no-op when flag already in target state, writes `installmentEvents` row + `writeAudit` row via same tx, uses `.for("update")` on packageInstances row
- `packages/services/src/index.ts`: Added `setPackageOverdraft` to named exports from `./installment.service`
- `packages/api/src/routers/installments.ts`: Added `setOverdraft` procedure mirroring `manualUnlock` pattern (tenantDb guard → member guard → admin-role guard); exported in `installmentsRouter` object; imported `setPackageOverdraft` from `@avantej-core/services`
- `packages/services/src/appointment.service.ts`: Changed line ~264 from `if (lockedPkg.isLocked)` to `if (lockedPkg.isLocked && !lockedPkg.allowCreditOverdraft)`, added comment noting that `check-ins.service.ts` must also honour this flag if it ever adds an isLocked check
- `apps/server/src/tests/helpers/db-mock.factory.ts`: Added `installments`, `installmentEvents`, `packageInstances` to `query` object in `createMockTenantDb()`
- `apps/server/src/tests/unit/services/installment.test.ts`: Added import for `setPackageOverdraft`; added `describe("setPackageOverdraft")` block with 4 test cases (enable, idempotent enable, disable, not-found)
- `apps/server/src/tests/unit/services/appointment.service.test.ts`: CREATED — 3 test cases for the A.1.5 gate: locked+overdraft=true→proceeds, locked+overdraft=false→throws, unlocked+overdraft=false→proceeds
- `apps/server/src/tests/integration/installments.integration.test.ts`: CREATED — 2 integration tests: enable overdraft → row updated + audit_log row exists; idempotent call → no audit row written. Guards with `shouldSkipIntegration()`

DONE: #15
DONE: #16
DONE: #17
DONE: #18 (other isLocked paths found: `installment.service.ts:455` — already-locked early-return in evaluateAndLockIfOverdue (not a consumption gate); `installment.service.ts:555` — unlock precondition guard; `installment.service.ts:769` — rescheduleInstallment admin workflow gate (overdraft not applicable); `installment.service.ts:88x` — adminOverview filter predicates (not gates); `package-instance.service.ts:67,174,193,359,388` — schema mapping only. check-ins.service.ts: zero isLocked matches confirmed. Only appointment.service.ts:264 is a consumption gate.)
DONE: #19
DONE: #20
DONE: #21
DONE: #22

### Decisions Made
- Used `bun:test` imports (not vitest) for all new test files — matched the existing test file convention despite plan documentation saying "Vitest"
- `appointment.service.test.ts` uses a counter-based select mock that handles the exact call sequence inside `createAppointment`: call 0=evaluateAndExpireIfOverdue (line 247), call 1=evaluateAndExpireIfOverdue again (inside evaluateAndLockIfOverdue), call 2=getGracePeriodDaysForPackage, call 3=evaluateAndLockIfOverdue inner FOR UPDATE, call 4=A.1.3 FOR UPDATE
- `select().where()` mock made thenable (added `.then()` property) to handle code that awaits `.where()` directly without chaining further
- Integration test inserts a minimal packageInstances row using a real `serviceId` fetched from dev DB; gracefully skips with a console.warn if no services exist
- `rescheduleInstallment` isLocked check at line 769 is an admin workflow guard (prevents rescheduling on locked packages), NOT a credit-consumption gate — overdraft flag is correctly NOT applied there

### Issues Encountered
- `appointment.service.test.ts` mock chain required iterative debugging: initial `{} is not iterable` error was from `.where()` returning an object (not a promise), requiring `.then()` on the where-result object; then `"Package instance not found"` was from incorrect call count (4 calls needed, not 4 because evaluateAndLockIfOverdue internally calls evaluateAndExpireIfOverdue again)
- `setPackageOverdraft` tests in `installment.test.ts`: 4 pass cleanly; all 5 pre-existing evaluateAndLockIfOverdue failures are unchanged

### Type-check
- PASS — zero new type errors in any owned file beyond the pre-existing `bun:test` module resolution issue affecting all 55+ test files in the project (tsconfig gap, not introduced by this work)

---

## Agent: Agent 5 (frontend) — Phase 5
**Completed:** 2026-04-23T15:04:30.000Z

### What I Did
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added `showOverdraftDialog` and `overdraftReason` state variables
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added `setOverdraftMutation` wired to `client.installments.setOverdraft`, invalidates `installments-overview` query on success
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added overdraft row in Package Info grid (amber "On" pill / muted "Off" text) — cast via `allowCreditOverdraft` optional property
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added "Allow Overdraft" / "Disable Overdraft" toggle button in the action-button row of the sheet
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added Overdraft Dialog (mirrors Manual Unlock dialog — reason textarea required, confirm disabled until non-empty)
- `apps/web/src/components/pages/packages/installments-page.tsx`: Added amber "Overdraft" pill badge beside status badge in overview table rows when `allowCreditOverdraft === true`
- `apps/web/src/components/pages/packages/installments-page.tsx`: Updated `closeSheet` to reset `showOverdraftDialog` and `overdraftReason`
- `apps/web/src/__tests__/helpers/mock-client.ts`: Added `setOverdraft: vi.fn().mockResolvedValue({})` to the `installments` namespace
- `apps/web/src/__tests__/pages/packages/installments-page.test.tsx`: Added test "opens the Allow Overdraft dialog, fills reason, submits, and calls setOverdraft with correct args"
DONE: #23
DONE: #24

### Decisions Made
- Used `(selectedInstance as { allowCreditOverdraft?: boolean })` cast throughout — `allowCreditOverdraft` is on `packageInstances.$inferSelect` but the `AdminInstallmentOverviewItem` type (inferred from `client.installments.adminOverview`) may not yet include it if the backend type hasn't been rebuilt; the cast avoids type errors while staying runtime-safe
- Dialog mirrors Manual Unlock dialog structure exactly as instructed (reason textarea, submit disabled until non-empty)
- Overdraft badge in table rows uses flex wrapper around the StatusBadge to avoid layout breaking

### Issues Encountered
- None — pre-existing type errors in unrelated files (calendar, customers, auth) were present before this change and are not new

### Type-check
- pass (no errors in installments-page.tsx or any file I touched)

---

## Run: 2026-04-23 — /execute
**Trigger:** /execute
**Plan:** zplan/04-23_12-38_installment-enhancements/plan/plan.md

### Phase outcomes
- Phase 1: pass — Due Soon backend filter + frontend tab; SQL COUNT fix (OQ-SCAL) folded in
- Phase 2: pass — Next-due + grace-period dates in detail sheet
- Phase 3: pass — Schema + tenant migration 0016_worried_wolfpack (bundles incidental expenses.currency drift, approved); migration NOT yet applied to DB (user action)
- Phase 4: pass — setPackageOverdraft service + setOverdraft oRPC + appointment lock-gate modified
- Phase 5: pass — Overdraft toggle UI, table badge, reason dialog, mutation

### Final build status
- type check: PASS (no new errors on any of our new symbols across all phases; pre-existing errors in unrelated files persist)
- lint: not separately run (Biome gates in pre-commit)
- tests: Agent 1A added 4 due_soon cases; Agent 4 added 4 setPackageOverdraft + 3 appointment-gate unit tests + 2 integration tests (guarded); Agent 1B + 5 extended frontend tests

### Cross-agent decisions
- Folded scalability fix (SQL COUNT) into Phase 1 Task #4 (user-approved)
- Phase 3 migration bundled expenses.currency drift → shipped as-is (user-approved)
- apps/native untouched per user directive; OQ3 resolved out-of-scope

### Subagent retry summary
- 0 retries. All 6 agents wrote logs on first attempt. No fallbacks.

### Commits landed
- 3428bbff Phase 1
- 15c6289f Phase 2
- e7b13df6 Phase 3
- 8900a884 Phase 4
- (pending) Phase 5

---
