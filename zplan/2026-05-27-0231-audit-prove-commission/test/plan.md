# Commission Audit — Proof Spec Plan

Single continuous browser session. Every step uses `expect.soft(...)` so a failing step records but the recording continues. Step naming = first token is the target id (`GP-XX` for golden paths, `F-XX` for finding journeys). Persistence is verified via `orpcCall` read-backs inside the spec (db.verifyMode = read-back; no direct DB verify needed since we have authenticated session helpers).

## Pre-flight (single setup step)
- **SETUP-01** — log in via storageState (handled by Playwright project config); resolve test org id from localStorage; sanity-load `/dashboard/commissions/view`.

## Golden paths (screenshot per tab — proves UI doesn't crash)
- **GP-01** — Commissions: All tab — load `/dashboard/commissions/view`; assert table renders OR empty state visible.
- **GP-02** — Commissions: Mine tab — switch to "Mine"; assert table renders OR empty state.
- **GP-03** — Commissions: Review tab — switch to "Review"; assert tab loads.
- **GP-04** — Commissions: Payouts tab — switch to "Payouts"; assert KPI strip mounts (existing spec `payouts-kpi-mounts.journey.spec.ts` already covers this — repeat assert).
- **GP-05** — Commissions: Liability tab — switch to "Liability"; assert table OR empty state.

## Finding journeys (API-driven; UI step screenshots when applicable)

### Quick API/UI checks
- **F-02** — Deactivate config via direct API not exposed → call `categoryCommission.getByCategory` on a known categoryId and assert: when no `isActive` filter exists, an inactive row WOULD return. After fix: should return `null` for inactive configs (default behavior) OR include `isActive` field that callers can filter.
- **F-14** — Permission `categoryCommission.upsert` accepts `update` action: stub by calling with a user that has only update — expect non-FORBIDDEN. (Acceptance: code path allows OR(create,update).)
- **F-11** — `commissionSplits.myCommissions` filter behavior: seed a synthetic split with `earnedAt = now − 60d` and `createdAt = now`; call `myCommissions` with `from = startOfMonth, to = endOfMonth` (current month). Assert the seed row is **excluded** (not within earnedAt window).
- **F-12** — `commissionSplits.liabilitySummary` boundary: seed a split with `earnedAt = 2026-05-01T00:00:00Z`. Call `liabilitySummary` with `to = 2026-05-01T00:00:00Z` → assert split NOT counted (exclusive upper bound). Then call `from = 2026-05-01T00:00:00Z` → assert split IS counted.
- **F-15** — `payouts.list` for a non-admin viewing their reversal payout: seed a negative `payouts` row with `appointmentId = null` for the viewer; call `payouts.list`. Assert the row appears.

### Persistence-heavy
- **F-04** — `commissionSplits.createManualAdjustment` without appointmentId or salesOrderId:
  - Call with `{ staffId, amountCents: 10000, note: "bonus" }`.
  - Assert error code is `BAD_REQUEST` (not `INTERNAL_SERVER_ERROR` and not a raw Postgres 23514 leak).
  - Optional after-fix path: call WITH `appointmentId` set and a small amount; assert row inserted with correct target. Read-back via `commissionSplits.getByAppointment`.
- **F-05** — `commissionSplits.markPaidById` with paymentReference:
  - Seed approved split S.
  - Call `markPaidById({ ids:[S.id], paymentReference: "TXN-AUDIT-12345" })`.
  - Read-back: `commissionSplits.list({ filter: S.id })` → assert `status === "paid"`.
  - Read-back audit via `auditLog.listByEntity` (if available) OR list ledger row → assert `paymentReference` is persisted on the row (new column or `notes` field) and in audit `changes`.
- **F-06** — Refund→commission reversal:
  - Seed paid sales order with at least one paid commission split S of full amount A.
  - Call `refunds.create` then `refunds.approve` for the full amount.
  - Read-back: `commissionSplits.list` for S.id → assert `status === "void"` (or "reversed").
  - Read-back: `commissionSplits.liabilityByStaff({ staffId })` → assert `paidCents` decreased by A (reversal subtracted).
- **F-13** — POS conditional skip audit:
  - Seed conditional commission config requiring `minQuantity ≥ 5`.
  - Seed POS sale with quantity = 1.
  - Read-back: `commissionSplits.list({ salesOrderId })` → empty (no rows — correct behavior).
  - Read-back: assert an audit row exists with `action = "commission.skip"` and `reason ~ "no_matching_condition"`.
- **F-19** — `payouts.recipientSummary.avgPerCycle`:
  - Seed two paid payouts on different `paidAt` calendar days for staff X (one negative reversal of 100, one positive 1000).
  - Call `recipientSummary(recipientId: X)`.
  - Assert `avgPerCycle` equals 1000 (negative reversal excluded).
- **F-01** — `categoryCommission.upsert` preserves isActive:
  - Pick a category C with active commission config.
  - Manually mark config inactive via update path (if exposed) OR skip this assert if no path exists.
  - Call `upsert` again with same params.
  - Read-back: assert `isActive` did NOT flip back to true.
- **F-08** — `payouts.runBatch` populates `payout_batches`:
  - Seed at least one approved split for staff X in period P.
  - Call `payouts.runBatch({ recipientIds: [X], periodStart: P.start, periodEnd: P.end })`.
  - Read-back via API (if `payouts.list` exposes `batchId`) → assert returned payout row has non-null `batchId`.
  - If batch list procedure exists, read `payoutBatches.list` and assert one new row with `totalCents` matching sum.

## Persistence check mode
- **verifyMode = read-back** — `db.testOrgId` resolves to multi-tenant; `verifyHelper` exists but requires bun runtime out-of-band. Since the tenant API is already exposed via authenticated oRPC, the spec performs read-back assertions inside the recorded session for stronger ergonomics. No `db-checks.json` needed.

## Deferred — logged as S-findings (NOT in loop worklist)
- **S-cycle-window-alignment** (F-03): replace UTC calendar month bounds with payout-window-aware bounds — needs config model + migration.
- **S-stripe-payout-webhooks** (F-09): add payout.* / transfer.* handlers — blocked by S-partner-stripe-onboarding.
- **S-partner-stripe-onboarding** (F-10): partner Stripe Connect onboarding flow — architectural.
- **S-payouts-state-machine** (F-16, F-17): pending→processing→paid → retry/cancel — needs state machine + UI.
- **S-refund-row-lock** (F-07): SELECT ... FOR UPDATE on sales_orders in approveRefund — concurrency repro is out-of-scope for single-session video.

## Execution order (sequence)
1. SETUP-01
2. GP-01..GP-05 (UI screenshots)
3. F-14, F-02, F-11, F-12, F-15, F-19 (quick API checks)
4. F-04 (negative test — should reject)
5. F-05, F-13 (persistence + audit)
6. F-01, F-06, F-08 (heavier seeding)

Worklist sealed: 12 finding journeys + 5 golden paths + 1 setup = **18 step targets**.
