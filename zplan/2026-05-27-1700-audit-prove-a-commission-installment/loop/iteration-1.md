# Iteration 1 — Commission + Installment remediation

**Session:** `zplan/2026-05-27-1700-audit-prove-a-commission-installment/`
**Branch:** `audit-prove-a/commission-installment-20260527-1700`
**Approval:** user `go` → all 12 actionable findings approved (4 deferred per humanNote)
**Parallel fix agents:** 3 (O, P, Q)
**Build gate after iteration:** `bun check-types --force` ✅ green (production code); turbo dts build fails with pre-existing TS7056 scaling issue

## Fixed targets (12)

### Agent O — Commission engine (4 fixes)

| ID | Severity | File | Change |
|---|---|---|---|
| F-COM-A | critical | `packages/api/src/routers/commission-splits/read.procedures.ts:85` | `context.member.id` → `context.member.userId` (already applied by prior session iter — verified by Agent O) |
| F-COM-B | critical | `packages/services/src/commission-calculator.service.ts:485-503, 659` | Look up latest `commission_config_version_id` by `categoryId` (DESC versionNumber) and propagate to insert. Logs warning when no version row exists (pre-migration tenants). (Already applied) |
| F-COM-C | high | `packages/services/src/commission-splits.service.ts:1947-2011` | Scope reversal to specific salesOrderItemIds when `items.length > 0` (line-level refund); preserves whole-order behavior when `items.length === 0`. |
| F-PAY-3 | critical | `packages/services/src/commission-splits.service.ts:markCommissionSplitsPaid` + `packages/api/src/routers/commission-splits/lifecycle.procedures.ts` | Unified mark-paid pipeline: FOR UPDATE lock → group by staffId → create payouts row per staff (linked to `payout_batches` via `getOrCreatePayoutBatch`) → back-link `payoutId` on splits → dual audit (`payout.create` + `commission.mark_paid`). Liability tab now writes proper payout rows. |

Integration tests: **12/12 pass** (commission-approve-invariants, commission-dedup, no-show, refund-state-machine).

### Agent P — Payouts UI + audit (5 fixes)

| ID | Severity | File | Change |
|---|---|---|---|
| F-PAY-1 | high | `apps/web/src/components/pages/commissions/liability-tab.tsx` | markPaidBatch onSuccess now invalidates `payoutKeys.list(orgId)` alongside commission keys. |
| F-PAY-4 | high | `apps/web/src/components/pages/commissions/payouts-tab.tsx` | Replaced `Math.abs(p.amount)` with signed amount in `disbursedThisMonth` + `avgPayout`. Added `reversalsThisMonth` sub-stat displayed in rose under main KPI. avgPayout excludes reversal rows. |
| F-PAY-6 | critical | `payouts-tab.tsx` + `apps/web/src/features/payouts/api.ts` | Added per-row DropdownMenu with Mark Paid / Mark Failed / Cancel (pending/processing) and Retry / Cancel (failed). Hooks added: `useMarkPayoutPaid`, `useMarkPayoutFailed`, `useRetryPayout`, `useCancelPayout` with full invalidation. Gated on `commission_payout:process` permission. |
| F-PAY-10 | medium | `apps/web/src/features/payouts/api.ts` | `useRunBatch` now forwards `confirmImmediately` to mutation payload; defaults undefined (API default `true`) for backward compat. |
| F-COM-D | medium | `packages/services/src/category-commission.service.ts` + `packages/api/src/routers/category-commission.ts` | `upsertCategoryCommissionConfig` + `deleteCategoryCommissionConfig` now `writeAudit("category_commission.upsert\|delete")` inside transaction. Router passes `_actor` from context. |

### Agent Q — Installments (3 fixes + RBAC seed)

| ID | Severity | File | Change |
|---|---|---|---|
| F-INS-1 | high | `packages/services/src/installment.service.ts:calculateInstallmentAmounts` | Rounding remainder moved from installment #1 → last installment, matching tax-amount remainder convention. |
| F-INS-2 | high | `packages/services/src/installment.service.ts` + `apps/server/src/services/pos.service.ts` | `confirmInstallmentPayment` now accepts `tx \| db` + `opts: { inTransaction?: boolean }`. POS first-installment inlined UPDATE replaced with `await confirmInstallmentPayment(tx, ..., { inTransaction: true })`. Audit log + completion flip now fire correctly. Caveat: when `inTransaction=true`, post-tx `markCompleteIfFinal` is skipped — hourly cron sweep handles the 1-installment edge case. |
| F-INS-4 | high | `packages/api/src/routers/installments.ts` + `packages/services/src/permission.service.ts` + `packages/db/src/seed-rbac.ts` + `packages/db/src/seeds/permissions.seed.ts` | 7 procedures (manualUnlock / processRefund / suggestRefund / adjustCredits / setOverdraft / reschedule / waive) now use `requirePermissionOrpc("installment_management", ...)` instead of `role !== "admin"` check. Added `installment_management` to `Resource` union + both seed files (read/create/update/delete). |

## Orchestrator follow-up (build infra)

While reconciling cross-agent type errors:
- Added `partnerStripeRouterType` stub to `packages/api/src/routers/_types/server-router-types.ts` (covers `createOnboardingUrl`, `getStatus`, `refresh`, `confirmViaStripe`). This was a long-standing latent gap from commit `aa993e8b feat(payouts): confirmPayoutViaStripe` — the server router was added without a client type stub, masked by stale api dist.
- Wired `partnerStripe: serverRouterTypes.partnerStripeRouterType` into `appRouter` in `packages/api/src/routers/index.ts`.
- Fixed type cast at `apps/web/src/features/payouts/api.ts:369` — `as Promise<PartnerStripeStatus>` → `as unknown as Promise<PartnerStripeStatus>` (oRPC's `ClientPromiseResult` is a wrapper, not a bare Promise).

## Deferred to human (4)

- **F-INS-3** (critical) — Cron-vs-payment race + open-on-read mutation. Not browser-testable; needs backend integration harness with concurrent process simulation.
- **F-SAAS-1** (critical) — Stripe lifecycle never writes `organizations.paymentStatus`. Control-panel DB write, outside tenant scope.
- **F-SAAS-2** (critical) — No past-due → suspended sweeper cron. Needs cron addition in `wrangler.jsonc` + new service.
- **F-SAAS-3** (high) — `markActive` / `markPastDue` no event-timestamp ordering guard. Needs webhook ordering integration test.

## Build status

| | Status |
|---|---|
| `bun check-types --force` | ✅ green (3/3) |
| `bun check-types` (cached) | ⚠️ web fails — reads stale api dist |
| `bunx turbo build --filter=@avantej-core/api` | ❌ pre-existing TS7056 (router type too large for rolldown dts emit) |
| Integration tests (commission/refund/POS bundle) | 26 pass / 0 fail / 1 skip |

The TS7056 issue is pre-existing (flagged in the prior session's report too). All production code is type-correct via `tsc --noEmit`; the issue is dist emit only.

## Cumulative across both sessions

| Session | Fixed | Already-shipped | Deferred |
|---|---|---|---|
| `2026-05-27-0143-audit-prove-a` | 48 | 14 | 1 (CPR-04) + 1 partial (AC-A-06) |
| `2026-05-27-1700-audit-prove-a-commission-installment` (this) | 12 | (orchestrator already-shipped: F-COM-A, F-COM-B) | 4 (F-INS-3, F-SAAS-1/2/3) |
| **Combined** | **60** | **14** | **5** + **1 partial** |
