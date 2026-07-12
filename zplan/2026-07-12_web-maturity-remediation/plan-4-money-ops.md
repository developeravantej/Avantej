# Plan 4 — Money Ops: test the money-movement surfaces

**Agent scope:** payouts, payroll periods, commissions liability/adjustments, reports exports. Read [00-orchestration.md](00-orchestration.md) shared conventions first. This plan is mostly test-writing; the only product code change is the payroll unlock dialog.

## Goal
Close the inverted risk/coverage gap: payouts (zero e2e) and payroll periods (zero tests of any kind) are the most sensitive money-movement flows in the app. Also replace the `window.prompt` unlock path so it becomes testable.

## User journeys affected
- **Manager runs a payout batch:** preview → run → per-recipient process → markPaid / markFailed → retry / cancel. Today unproven end-to-end.
- **Manager locks a payroll period** (finalizes commissions) and later unlocks with a reason. Today: untested, and unlock reason is collected via raw `window.prompt` (`PayrollPeriodsPage.tsx:163`) — unautomatable and off-convention UX.
- **Finance marks commission liabilities paid in batch / makes a manual adjustment:** unit-untested money mutations.

## Tasks

### Task 1 — Payroll unlock dialog (product code)
- `apps/web/src/components/pages/payroll-periods/PayrollPeriodsPage.tsx:163`: replace `window.prompt` with a proper confirm dialog (shadcn Dialog + textarea reason, reason required, destructive styling), matching the pattern of existing reason dialogs (e.g. expenses `RejectDialog`). Keep the same `unlock` mutation contract.

### Task 2 — Payroll unit tests
- New: `apps/web/src/__tests__/pages/payroll-periods.test.tsx` — list renders; `lockNow` called on confirm; unlock dialog requires a reason and passes it to the mutation; permission gating (`PayrollPeriodsPage.tsx:189`); pending-state disables buttons (`:265`).

### Task 3 — Payouts e2e (highest value in this whole session)
- New folder: `_e2e/web/payouts/` — `smoke.spec.ts` + `payout-batch.lifecycle.spec.ts`:
  - Seed confirmed commissions (reuse seeding from `_e2e/web/commissions/commissions-journey.spec.ts`).
  - `previewBatch` → `runBatch` → assert batch + recipient rows → `markPaid` one recipient, `markFailed` another → `retry` the failed → `cancel` remaining → assert final states and that ledger totals reconcile.
  - Drive via API (`page.request` → `/rpc/...`) with UI assertions on the payouts tab; idempotency cross-check exists in `e2e/commission-payout-idempotency` — don't duplicate it, link it.
  - `payout-rbac.rbac.spec.ts`: staff without payout permission cannot see/trigger runBatch.

### Task 4 — Payroll e2e
- New: `_e2e/web/payroll-periods/` — `lock-unlock.lifecycle.spec.ts`: lock a period → assert commission finalization side-effect (whatever `lockNow` gates — read the server procedure to assert the real invariant) → unlock with reason → assert audit/reason recorded.

### Task 5 — Commissions money-mutation unit tests
- New: `apps/web/src/__tests__/components/commissions/liability-tab.test.tsx` — `exportLiabilityCsv` and `markPaidBatch` (`liability-tab.tsx:337,368`) called with selected rows; empty-selection guarded.
- New: `apps/web/src/__tests__/components/commissions/manual-adjustment-dialog.test.tsx` — `createManualAdjustment` (`manual-adjustment-dialog.tsx:113`) payload correctness (amount in **integer cents**, sign, reason required).

### Task 6 — Reports client export formatters
- New: `apps/web/src/__tests__/pages/reports-export.test.ts` — `reports/export-csv.ts` and `export-pdf.ts`: given fixture rows, CSV escapes commas/quotes and money renders from cents correctly; PDF export invoked with expected doc structure (mock jsPDF-equivalent lib actually used — check imports first; note jsPDF was deleted from print docs, the reports one may differ).

### Task 7 — Run-batch drawer unit test
- New: `apps/web/src/__tests__/features/payouts/run-batch-drawer.test.tsx` — `features/payouts/components/run-batch-drawer.tsx`: preview shown before run; run disabled until preview loads; correct recipients passed to `runBatch`.

## Files owned
- `apps/web/src/components/pages/payroll-periods/PayrollPeriodsPage.tsx` (+ new dialog component it adds)
- All new test files above; `_e2e/web/payouts/**`, `_e2e/web/payroll-periods/**`

## Risks
- E2E must run against the local test tenant only (`franchisee@gmail.com`) — payout mutations move ledger state; use freshly seeded commissions, never assert against pre-existing rows.
- Commission invariants must hold: **commission reaches trainers in all cases** (rotation vs requested) — the lifecycle spec should assert recipient coverage, not just batch status.
- `window.prompt` → dialog changes a destructive-action UX: keep the mutation payload identical.

## Verification
1. `bun check-types`; `cd apps/web && bun run test` — all new unit tests green.
2. Run `_e2e/web/payouts/` and `_e2e/web/payroll-periods/` locally (memory `project_e2e_local_run_setup` for prerequisites).
3. Browser: payroll unlock now opens a dialog, requires reason, unlocks successfully.
4. Existing commissions e2e (`_e2e/web/commissions/`) still green.
