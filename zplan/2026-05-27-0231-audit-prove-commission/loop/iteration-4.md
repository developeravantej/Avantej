# Iteration 4 — S-payouts-state-machine (deferred → fixed)

## Target
**F-16/F-17 / S-payouts-state-machine** — `payouts.status` enum carried `pending | processing | paid | failed | canceled`, but `runBatch` inserted directly at `paid` for every payment method. The other four states were unreachable: no `markPaid`, no `retry`, no `cancel`, no `failed` entry point. This blocked Stripe payout webhooks (F-09) since there was no in-flight state to flip to.

## Scope
Per the agreed plan (Phases 1–3, UI deferred):

### Phase 1 — service procedures
New exports in `packages/services/src/payouts.service.ts`:
- `markPayoutPaid(db, id, { paymentReference, actor })` — `pending|processing → paid`. Flips linked splits to `paid`. Appends ref to `description`. Audit row `payout.mark_paid`.
- `markPayoutFailed(db, id, { reason, actor })` — `pending|processing → failed`. Records reason in `notes`. Linked splits untouched. Audit row `payout.mark_failed`.
- `retryPayout(db, id, { actor })` — `failed → pending`. Resets `paidAt = null`. Audit row `payout.retry`.
- `cancelPayout(db, id, { reason, actor })` — `pending|failed → canceled`. Linked splits revert to `approved`, `payoutId` cleared so they re-enter the batch pool. Audit row `payout.cancel`.

Each transition acquires `SELECT ... FOR UPDATE` on the payout row via shared helper `lockPayoutForUpdate` — mirrors the F-07 refund-lock pattern. State-machine guards reject from-states that don't match.

### Phase 2 — runBatch refactor
Added `confirmImmediately?: boolean` (default true → existing cash-flow semantics unchanged). When false:
- Payout inserted at `status='pending'`, `paidAt = null`, no `manualPayoutConfirmedAt/By`.
- Linked commission_splits stay at `status='approved'` but carry the new `payoutId` (re-batch protection).

Backward compat: every existing caller (no flag) gets the old behavior. New non-cash flows opt in.

### Phase 3 — oRPC procedures + e2e proof
Added to `packages/api/src/routers/payouts.ts`:
- `markPaid({ id, paymentReference })` — admin-only via `commission_payout:process`.
- `markFailed({ id, reason })` — same auth.
- `retry({ id })` — same.
- `cancel({ id, reason })` — same.

Plus `confirmImmediately` added to the `runBatch` Zod schema and threaded through to the service. **This was the bug that almost shipped silently** — the service accepted the flag but the router schema dropped it, so the first spec run still got `status='paid'`. Caught it via the runtime e2e (Phase 3 saved Phase 2).

### Phase 4 — UI: deferred (separate PR by design)

## Runtime proof
Spec: `e2e/gap-prove-payouts-state-machine.spec.ts` — single test, 2.3 minutes, video at `video/state-machine-run.webm` (2.3 MB).

```
LC-01  runBatch(confirmImmediately:false)  → pending payout; splits remain approved ✓
LC-02  markPaid(ref)                       → paid; splits flip to paid; ref in description ✓
LC-03  second runBatch                     → second pending payout ✓
LC-04  markFailed(reason)                  → failed ✓
LC-05  retry                                → failed → pending ✓
LC-06  cancel(reason)                       → canceled; splits revert to approved + payoutId cleared ✓
LC-07  concurrent markPaid race            → r1=400, r2=ok (FOR UPDATE serialised) ✓

1 passed (2.3m)
```

LC-07 specifically validates the row lock — `lockPayoutForUpdate` makes the second concurrent call wait, then the post-lock status guard sees `status='paid'` and rejects with BAD_REQUEST. Mirrors the F-07 pattern.

## Gate
- `cd packages/services && bun run build` — clean.
- `bunx tsc --noEmit -p packages/services` — clean on changed files (pre-existing `bun:test` errors in test files only).
- `bunx tsc --noEmit -p packages/api` — clean on changed files (pre-existing `bun:test` errors in test files only).

## Stripe webhooks (F-09) now unblocked
With `pending | processing | failed` reachable, a future Stripe webhook handler can:
- `transfer.created` → keep payout in `processing` (could add a service helper if we want this granularity).
- `transfer.paid` → `markPayoutPaid` (paymentReference = `transfer.id`).
- `transfer.failed` → `markPayoutFailed` (reason = Stripe error message).

S-stripe-payout-webhooks is still blocked by S-partner-stripe-onboarding (need the recipient Stripe Connect account model first), but the destination state machine is in place.

## Status
- S-payouts-state-machine → **fixed**.
- 2 deferred S-findings remain: stripe-payout-webhooks (waiting on partner onboarding), partner-stripe-onboarding (architectural).
- UI for the new procedures is a separate follow-up PR.

## Files changed
- `packages/services/src/payouts.service.ts` — +4 functions, runBatch refactor
- `packages/api/src/routers/payouts.ts` — +4 procedures, runBatch schema update
- `e2e/gap-prove-payouts-state-machine.spec.ts` — full lifecycle + concurrency proof (new)
- `gap-prove-state-machine.config.ts` — Playwright config (new)
- `zplan/.../loop/iteration-4.md` — this log
- `zplan/.../video/state-machine-run.webm` — video evidence
