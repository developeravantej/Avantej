# Iteration 2 — Tackle all 4 deferred items

**Session:** `zplan/2026-05-27-1700-audit-prove-a-commission-installment/`
**Approval:** user `continue all` → all 4 deferred findings approved (race-condition + SaaS lifecycle)
**Parallel fix agents:** 2 (R, S)
**Build gate:** `bun check-types --force` ✅ green (3/3 packages, 0 errors)

## Fixed targets (4)

### Agent R — F-INS-3 cron-vs-payment race (critical)

**Files:** `packages/services/src/installment.service.ts`, `apps/server/src/services/installment-sweep.service.ts`

**Root cause diagnosed:**
1. Deadlock-capable lock order — `confirmInstallmentPayment`/`rescheduleInstallment`/`waiveInstallment` locked child (`installments`) then parent (`package_instances`); sweep locked parent only. Cycle on contention.
2. TOCTOU in sweep — non-transactional outer candidate scan; concurrent payment between read and inner tx could overwrite `paid` with `overdue`.
3. Stale "matches confirmInstallmentPayment lock order" comment masked the bug across 3 functions.

**Fix:**
- **Canonical lock order established:** `package_instances FOR UPDATE` (parent) → `installments` CAS UPDATE (child via `WHERE status='pending'`). All 4 mutation paths now follow this order.
- `confirmInstallmentPayment`: added non-mutating pre-probe to resolve packageInstanceId, then reordered tx.
- `evaluateAndLockIfOverdue`: rewrote JSDoc to document the canonical order + CAS approach. The existing bulk `UPDATE installments WHERE status='pending'` already provided CAS guarantee — added inline comments explaining why 0-affected-rows is the correct outcome (not an error).
- `rescheduleInstallment` + `waiveInstallment`: pre-probe + parent-first lock order.
- `installment-sweep.service.ts`: module-level JSDoc now documents the F-INS-3 concurrency strategy (outer SELECT is intentionally non-locking; inner CAS enforces correctness).

**Verification:** Type-check green. Integration tests: 11/22 pass (11 failures are pre-existing `pkg_owner_xor` fixture violations, confirmed identical before/after — not regressions).

### Agent S — F-SAAS-1/2/3 SaaS lifecycle bundle (2 critical + 1 high)

**File:** `apps/server/src/services/saas-subscription.service.ts` + `apps/server/src/index.ts`

| ID | Severity | Fix |
|---|---|---|
| **F-SAAS-1** | critical | `markPastDue`/`markActive`/`upsertSubscriptionFromStripe` now run inside a Drizzle transaction that updates both `subscriptions.status` AND `organizations.paymentStatus` atomically. New `stripeStatusToPaymentStatus()` helper maps all Stripe statuses to the 4 `organizations.paymentStatus` values the middleware reads (`active` / `past_due` / `suspended` / `cancelled`). Unknown statuses default to `suspended` with warning. |
| **F-SAAS-2** | critical | Added `sweepPastDueSubscriptions(db?)` — SELECTs subscriptions WHERE `status='past_due' AND gracePeriodEndsAt < now()`, per-row atomically sets `subscriptions.status='unpaid'` + `organizations.paymentStatus='suspended'`. Idempotent (a second run finds no matching rows). Wired into the existing `0 2 * * *` cron in `apps/server/src/index.ts` (Workers Free plan already at 5-cron limit; no `wrangler.jsonc` change needed). |
| **F-SAAS-3** | high | `markPastDue` + `markActive` now accept optional `stripeEventCreatedAt?: number` (unix seconds from `event.created`). Before mutating: compare against row's `updatedAt`; if incoming ≤ updatedAt, log + skip (stale re-delivery). **Known limitation:** `updatedAt` is a proxy — any app-level write updates it, so a legitimate newer Stripe event arriving within the same second as an unrelated write could be skipped. **Correct fix follow-up:** add `last_stripe_event_at timestamp` column (migration). |

## Orchestrator follow-up

After Agent R + S finished, the type-check surfaced 5 instances of `Resource: "installment_management"` errors in `packages/api/src/routers/installments.ts`. Agent Q's edit to `packages/services/src/permission.service.ts` (adding `installment_management` to the Resource union) had not landed — possibly reverted between iterations.

**Fixed by orchestrator:** Added `| "installment_management"` to the Resource union in `permission.service.ts:68`. Rebuilt services dist. Type-check now green.

## Build status

| | Status |
|---|---|
| `bun check-types --force` | ✅ green (3/3) |
| Production code | type-correct |
| `bunx turbo build --filter=@avantej-core/api` | ❌ pre-existing TS7056 (router dts emit scaling — flagged across both sessions) |

## Follow-up tickets generated this iteration

1. Add `subscriptions.last_stripe_event_at timestamp` column + migration; replace the `updatedAt` proxy in F-SAAS-3 with the dedicated column.
2. Fix `api` package dts emit (TS7056) — explicit type annotation on merged `appRouter` export.
3. Fix the 11 pre-existing `pkg_owner_xor` integration test fixture failures (orthogonal to this session's work).

## Cumulative across CI session

| Iter | Fixed | Already-shipped | Notes |
|---|---|---|---|
| iter-1 (`go`) | 12 | 2 (F-COM-A, F-COM-B) | + partnerStripe stub bonus |
| iter-2 (`continue all`) | 4 | — | All 4 deferred resolved |
| **Total** | **16** | **2** | **0 still open** in worklist |

## Cumulative across BOTH audit-prove-a sessions

| Session | Fixed | Already-shipped | Deferred |
|---|---|---|---|
| `2026-05-27-0143-audit-prove-a` (general) | 48 | 14 | 1 policy (CPR-04) + 1 partial (AC-A-06) |
| `2026-05-27-1700-audit-prove-a-commission-installment` | 16 | 2 | 0 — all addressed |
| **Combined** | **64** | **16** | **2** (1 policy decision, 1 migration follow-up) |
