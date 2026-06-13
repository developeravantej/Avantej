# Plan 2 — Commission/Payout Automation (Cron)

## Problem

The `scheduled` handler (`apps/server/src/index.ts:393`) runs installment sweep,
package-expiry, notification dispatch, reports, usage snapshot, onboarding alerts,
and tenant hard-delete. It runs **zero commission/payout jobs**. Consequences:

- Splits sit in `pending` indefinitely — nobody is reminded to approve them.
- Payout batches (`runBatch`) are 100% manual — managers must remember at cycle close.
- No settlement reconciliation. Your `CLAUDE.md` memory claims "Stripe reconciliation
  at 02:00" but the 02:00 slot only runs installment sweep + package expiry + name
  heal — **the reconciliation cron appears to have never been wired.** Confirm first.

## Hard constraint — cron budget

Workers **Free tier = 5 cron triggers**, and `wrangler.jsonc` already declares all 5
(`0 * * * *`, `0 1 * * *`, `0 2 * * *`, `0 3 * * *`, `0 9 * * *`). **Do NOT add a new
cron.** Fold new work into an existing slot's handler branch in `index.ts`, exactly
like package-expiry was folded into the 02:00 slot.

## Scope — three jobs, ranked. Ship 1 + 2; 3 needs a product decision.

### Job 1 — Stale pending-split alert (low risk, high value)
A daily sweep that, per active org, counts splits in `pending` older than N days and
emits a digest (in-app notification or queued email) to managers: "23 commission
splits (RM 4,210) await approval." Does **not** auto-approve — just surfaces the queue.

- **Slot:** fold into `0 9 * * *` (onboarding-alerts already there — manager-facing
  digests belong together).
- **New service:** `apps/server/src/services/commission-approval-alert.service.ts`,
  modeled on `installment-sweep.service.ts` (loop active orgs, per-tenant query,
  accumulate report, per-row failures logged not fatal).
- **Query:** `commission_splits WHERE status='pending' AND earned_at < now - interval`.
- Reuse `notification-dispatch` queue or the onboarding-alert mechanism — match
  whichever onboarding-alerts already uses to avoid a new delivery path.

### Job 2 — Settlement reconciliation for Stripe Connect payouts (correctness)
Payouts in `processing` with a `stripeTransferId` but no terminal state can be left
stranded if a webhook is missed. A daily reconcile re-checks Stripe and applies
`markPayoutPaid` / `markPayoutFailed`. **First confirm this isn't already wired** —
the webhook path (`transfer.created`/`reversed`) exists; this is the missed-webhook
backstop only.

- **Slot:** fold into `0 2 * * *` (already the "settlement/sweep" slot).
- **New service:** `apps/server/src/services/payout-reconcile.service.ts`. Per org,
  select payouts `status IN ('pending','processing') AND payout_method='stripe_connect'
  AND stripe_transfer_id IS NOT NULL`, fetch the transfer from Stripe, map to terminal
  state via the existing `markPayoutPaid`/`markPayoutFailed` helpers (idempotent —
  they CAS on current status).
- **Risk:** Stripe API calls inside a Worker cron — mind the subrequest budget. Cap
  per-run rows; the CAS makes partial runs safe to resume next day.

### Job 3 — Scheduled payout batch at cycle close (needs product sign-off)
Auto-run `runBatch` for each branch when its commission cycle closes (the cycle-window
machinery already exists via `resolveCycleBoundsForDate`). High value but **moves money
without a human** — must default OFF behind a per-tenant/per-branch opt-in flag.

- **Do NOT build until product confirms** auto-disbursement is wanted and what the
  guardrails are (max auto-amount? require `confirmImmediately=false` so it lands in
  `pending` for manual release rather than auto-paid?).
- Recommended v1 even if approved: auto-**create** the batch in `pending` (not paid),
  so the cron prepares the batch and a human still releases it. That captures most of
  the value with none of the "robot wired money to the wrong account" risk.

## Files to change
- `apps/server/src/index.ts` — add a `ctx.waitUntil(...)` dispatch in the chosen slot
  branch for Job 1 (09:00) and Job 2 (02:00), mirroring existing entries.
- `apps/server/src/services/commission-approval-alert.service.ts` (new).
- `apps/server/src/services/payout-reconcile.service.ts` (new).
- No `wrangler.jsonc` change (reusing existing crons).

## Risks
- **Subrequest budget** — each folded sweep adds per-org work to an already-busy slot.
  Job 2 also makes external Stripe calls. Cap rows/run; log what was deferred (never
  silently truncate — emit a count).
- **Idempotency** — both jobs must be safe to re-run. Job 1 is read-only (safe). Job 2
  relies on `markPayoutPaid/Failed` CAS guards (safe). Verify no double-notify in Job 1
  (dedupe digest per manager per day, or accept one-shot per run).
- **Memory drift** — update the `CLAUDE.md` memory note that claims reconciliation runs
  at 02:00, once the true state is confirmed.

## Verification
1. `bun check-types`.
2. Unit-test each service against a mock multi-tenant setup (mirror
   `installment-sweep` test if one exists): report counts correct, per-row failure
   doesn't kill the batch, idempotent re-run.
3. Local cron dispatch: trigger the `scheduled` handler manually (wrangler dev cron
   trigger or a test harness) for the 02:00 and 09:00 slots; confirm both new jobs fire
   and log their report.
4. Confirm Job 2 against a stubbed `StripeTransfersClient` (pattern already exists in
   `confirm-payout-via-stripe.integration.test.ts`).

## Open questions
- **Does a Stripe reconciliation job already exist somewhere** (separate cron file /
  webhook-only)? Grep `markPayoutPaid` callers + `wrangler.jsonc` before building Job 2.
- **Job 1 delivery channel** — match onboarding-alerts. Which is it (Resend email vs
  in-app notification rows)?
- **Job 3** — is auto-disbursement wanted at all? If yes, paid-or-pending default?
