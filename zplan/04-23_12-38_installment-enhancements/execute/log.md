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
