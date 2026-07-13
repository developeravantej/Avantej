# Plan 1 — POS/Sales: dead UI + coverage gaps

**Agent scope:** POS/sales domain only. Read [00-orchestration.md](00-orchestration.md) shared conventions first.

## Goal
Fix the two dead UI elements on the sales page, add unit coverage for refunds decision logic and payment-proof upload, and create the missing approvals trainer-assignment e2e journey.

## User journeys affected
- **Cashier exports sales:** opens Sales list → clicks "Export CSV" → today it does nothing → after fix it downloads a CSV of the filtered sales (parity with the working Cancelled tab export).
- **Cashier reviews a payment:** Sales → Payments tab → clicks a payment row → today only `console.info` fires → after fix it opens payment detail (or the control is removed — see Task 2 decision).
- **Manager approves a package with trainer assignment:** Approvals inbox → expand row → assign trainer → confirm. Currently untested end-to-end.

## Tasks

### Task 1 — Wire or remove the sales "Export CSV" button
- Evidence: `apps/web/src/components/pages/sales/view.tsx:305-311` — button has no onClick. Verified 2026-07-12: **no `salesOrders.exportCsv` procedure exists** (only `cancelled-sales.ts` and `audit-logs.ts` have exportCsv).
- **Preferred fix:** add `salesOrders.exportCsv` server procedure modeled on `packages/api/src/routers/cancelled-sales.ts` (same filter inputs as `salesOrders.list`, respects `accessibleNodeIds` + `guardInputBranchForContext`), then wire the button like `CancelledSalesTab.tsx:85` does.
- **Fallback if the router file would exceed the 400-LOC CI cap:** split into folder-module per CLAUDE.md, or (least preferred) remove the button and note it.
- If adding the procedure: follow orchestration rule 5 (rebuild services → api). Check `packages/api/src/routers/` for whether salesOrders is already a folder module.

### Task 2 — Payment row-select no-op
- Evidence: `apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx:431-434` calls `console.info` only; `PaymentsTab.tsx:17` demands an `onSelectPayment` callback. Verified: **no PaymentHistoryDialog component exists**; invoice/payment detail lives on `payment/view.tsx`.
- Fix: navigate to the payment/invoice detail (`/dashboard/payment/view` with the invoice/payment id as search param) OR open the existing invoice drawer if one is importable without cross-plan file edits. If neither is clean, make the row non-interactive and remove the callback prop. Do NOT build a new dialog from scratch in this plan.

### Task 3 — Unit tests: refunds decision panel
- New file: `apps/web/src/__tests__/features/refunds/refund-decision.test.tsx`.
- Cover: `features/refunds/components` — `InlineDecisionPanel` approve mutation wiring, `refunds-tab.tsx:90` reject, `BulkApproveBar:35` bulkApprove; RBAC gating on `refund_management:approve` / `refund_management:process` (hidden/disabled without permission).

### Task 4 — Unit tests: payment-proof section
- New file: `apps/web/src/__tests__/components/payment-proof-section.test.tsx`.
- Cover: `payment-proof-section.tsx:58` upload calls `uploadPaymentProof` with the file payload; `:91` download path; error state on failed upload. Mock the R2-facing client calls.

### Task 5 — E2E: approvals trainer-assignment journey
- New folder: `_e2e/web/approvals/` (currently EMPTY — this plan owns it).
- Specs: `smoke.spec.ts` (inbox renders) + `trainer-assignment.lifecycle.spec.ts`: seed/find a pending package instance → assign trainer via `ExpandedRowDetail` flow (API-drive the Radix selects per convention 4) → assert `packageInstanceStaff` reflects assignment → assert it leaves the pending list.
- Reuse seeding helpers from `_e2e/web/packages/approval-flow.lifecycle.spec.ts`.

## Files owned
- `apps/web/src/components/pages/sales/view.tsx`, `apps/web/src/routes/_authenticated/dashboard/_layout/sales/view.tsx`
- `apps/web/src/features/sales/components/PaymentsTab.tsx`
- `packages/api/src/routers/sales-orders*` (Task 1 only, if procedure added)
- New test files listed above; `_e2e/web/approvals/**`

## Risks
- Task 1 touches a shared API router — if another session has `sales-orders` edits in flight, coordinate before editing.
- POS is the business-critical surface; do not refactor anything beyond the two listed elements. **Installment display amounts must never regress** (show plan amounts, not full price).

## Verification
1. `bun check-types` (after services→api rebuild if Task 1 adds a procedure).
2. `cd apps/web && bun run test` — new tests green.
3. Browser: `http://avantej.localhost:3021/dashboard/sales/view` — Export CSV downloads; payment row click does something real (no console-only).
4. Run `_e2e/web/approvals/` specs.
