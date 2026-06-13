# Execute log — Installment full buildout

> Session 2026-06-13 · Branch checkpoint/6-11 · Uncommitted (working tree)

## Phase A — Admin UI ✅ (frontend-engineer agent)
- NEW service `getPackageInstallmentState` + export; NEW query proc `installments.getPackageState` (registered in index).
- NEW dialogs: WaiveInstallmentDialog, RefundPackageDialog (uses suggestRefund), AdjustCreditsDialog (+reset override), UnlockPackageDialog, OverdraftToggle.
- InstallmentScheduleDialog gets `canManage` prop + package-actions footer; InstallmentsTab gets per-row Waive.
- `bun check-types` 3/3, 0 errors. NOT browser-verified yet (deferred to Phase G).

## Phase B — Schema migration ✅ (backend-engineer agent)
- `0091_installment_partial_pay_and_stripe.sql` (idempotent ADD COLUMN IF NOT EXISTS).
- installments += amount_paid, commission_amount, commission_distributed, stripe_payment_intent_id, stripe_payment_link_id.
- package_instances += stripe_customer_id, default_payment_method_id, auto_charge_enabled.
- Drizzle schemas updated; `bun gen:migrations` regenerated module.
- Gates: verify:migrations ✅, check-types ✅ (3/3), check-drift ✅ (tenant+controlPanel clean).

## Phase C — Partial payments ✅ (hands-on)
- `confirmInstallmentPayment` gains optional `amount` (+ stripe ids); accumulates `amount_paid`; status→paid only on full settlement; `installmentsPaid` advances only on full clear; nextDueDate/grace only advance on full.
- Credits now **proportional to money paid**: `floor(creditsTotal × totalPaid/totalDue)`, monotonic via max(). Converges to creditsTotal at full payment.
- Events record the collected delta (+ partial flag); audit action `installment.partial_payment` vs `installment.paid`.
- API `confirmPayment` accepts `amount`; `listUpcomingInstallments` exposes `amountPaid`; InstallmentsTab shows remaining (+ "X paid"); CollectPaymentDialog has editable amount field (default = full remaining) with partial/invalid hints.
- Legacy callers (POS, webhook) pass no `amount` → settle full remaining → unchanged behaviour.
- Gates: check-types 3/3 green; installment.service unit 24/24 pass. Browser verify deferred to G.

## Phase D — Per-payment commission ✅ (backend-engineer agent + my review)
- Decision: ONE immutable commission row per installment, created when it fully clears, sized to its proportional share; final installment trues up rounding. Applies ONLY to multi-installment plans (installmentsTotal > 1).
- Migration `0092`: `commission_splits.installment_id` (plain uuid + index); replaced partial unique index with 4-col COALESCE variant (raw SQL, outside drift scope).
- commission-calculator: extracted `planOriginationForOrder`; pure `scaleInstallmentCommission(plannedTotal, due, orderTotal, isLast, alreadyAttributed)` (floor for 1..N-1, true-up on last); new `distributeInstallmentOriginationCommission`; threaded `installmentId` through `_persistOriginationSplits`.
- Wired into `confirmInstallmentPayment` (isFull && installmentsTotal>1, best-effort try/catch, dynamic import to avoid cycle).
- Front-load DISABLED for multi-installment at both sites (pos.service.ts isMultiInstallmentPlan; webhook !hasInstallmentPkg). Single/'full' orders unchanged — both guards + confirm path use the same `>1` threshold (verified: no commission dropped).
- My review hardening: alreadySum query scoped to `installment_id IS NOT NULL` so manual/front-load splits never reduce the true-up.
- Gates (agent): verify:migrations ✅, check-types 0, 93/93 tests, drift clean. Re-verifying after hardening edit.

## Phase E — Stripe for installments #2..N ✅ (2 backend-engineer agents + my review)
### E1 — per-installment payment links
- `payments.createInstallmentPaymentLink({organizationId, installmentId}) → {url, paymentLinkId}` (single-use link, metadata type:"installment", remaining-due amount, prior-link deactivation, SP-01).
- Webhook `payment_intent.succeeded` branch for metadata.type==="installment" → amount-aware confirmInstallmentPayment + same-PI guard + link deactivation.
- Type stub registered; InstallmentsTab "Send payment link" row action (copy/open).
### E2 — saved-card auto-charge
- `payments.createCardSetupSession` (Stripe Checkout mode:"setup", hosted) → webhook `checkout.session.completed` (type:"installment_setup") stores stripe_customer_id/default_payment_method_id + autoChargeEnabled=true.
- `installment-autocharge.service.ts`: daily (folded into "0 2 * * *" after sweep — Workers 5-cron limit), off-session confirm:true PI per due installment, idempotency key `inst-autocharge-<id>-<dueEpoch>`, `isNull(stripePaymentIntentId)` anti-double-charge; on card/SCA error → fallback payment link + admin in-app notify; success confirmed by the E1 webhook branch.
- getPackageInstallmentState extended (stripeCustomerId, autoChargeEnabled); schedule dialog shows auto-charge badge + "Enable auto-charge (save card)" button.
- Reviewed: cron candidate query is independent of sweep status-flip (matches due_date<=now); off-session + idempotency correct. check-types 0 both sub-phases.

## Phase F — Refund-paid fix + POS #1 re-verify ✅ (hands-on)
- POS manual #1 audit gap: ALREADY FIXED (F-INS-2, pos.service.ts:960 routes cash #1 through confirmInstallmentPayment inTransaction → gets Phase C accounting + Phase D commission + audit). No action.
- `processRefund` rewritten (decision #4 — flag for manual, NO auto Stripe refund):
  - PAID installments → status 'refunded' (records reversed); sums `paidAmountToRefund`.
  - Pending commission splits for the order/package → voided; approved/paid splits counted as `commissionNeedingManualReversal`.
  - Admins notified in-app (`refund_required`) to issue the actual refund out of band.
  - Richer return surfaced through the API procedure.
- Gates: check-types 3/3, installment+commission unit 32/32 pass.

## Phase G — Verification suite ✅
- CRITICAL infra fix (CLAUDE.md "migrations first" rule): test tenant was at 0090. `migrate-all-tenants.ts --filter=test-fitness-franchi` applied 0091→0093. (`migrate-test-tenant.ts` uses a stale static env URL — use migrate-all-tenants which decrypts the per-org connection string from .dev.vars.)
- Dev servers had died mid-session; restarted `bun dev:server` + `bun dev:web` (background).
- New spec `e2e/installment-lifecycle.journey.spec.ts` — **7/7 passed (1.4m)** on the live migrated tenant:
  - A create multi-installment sale (rows/amounts/#1 paid) ✅
  - B+C partial payment + proportional credits + top-up→paid ✅
  - D per-installment commission — CLEAN-EXIT (test tenant has no commission tracks configured); conservation itself proven by 8 unit tests, NOT exercised live.
  - E waive ✅  F refund (paid→refunded, pending→cancelled, commission voided) ✅ — notification-row assertion SKIPPED (no per-org admin notification query proc; the row IS written by the service).
  - G per-installment payment link returned + persisted ✅
- Regression: `pos-checkout-installment-schedule.journey.spec.ts` **2/2 passed**.

## STATUS: all 7 phases complete. Working tree only (NOT committed). check-types 3/3; services unit 32/32; commission conservation 8/8; e2e 7/7 + regression 2/2.
### Caveats RESOLVED (post-session "go all")
1. D conservation proven LIVE — seeded on_sale track (seed-commission-track-test-tenant.ts); lifecycle D now 3×300¢=900¢=planned. Surfaced + fixed 2 real bugs (userId-as-memberId → uuid audit crash; track-version id into category-config FK). committed in 21f7511b.
2. E2 auto-charge proven LIVE against real Stripe test mode — `apps/server/src/tests/integration/installment-autocharge.integration.test.ts` (3/3):
   - success: off-session PI pi_3ThrHr… succeeded on acct_1TWwNZ, persisted, metadata correct.
   - SCA: authentication_required card → no PI, fallback plink_… created, `installment_autocharge_failed` notification written.
   - refund: `refund_required` notification written; paid→refunded.
3. UI dialog click-paths proven in real browser — `e2e/installment-admin-ui.journey.spec.ts` (10/10): partial-pay hint, waive, adjust-credits, overdraft, refund (suggested amount), unlock-hidden-when-unlocked, send-link. No app bugs.

### Remaining (genuinely not done)
- Migrations 0091/0092 rollout to OTHER live tenants (only test tenant migrated).
- Push / PR (held — entangled remote state; user chose local-only).
- Stripe test PM gotcha for connected accounts: use `tok_*` tokens, not `pm_*` (platform-scoped). Documented in the integration test.
Next phases change credit-unlock logic, distribute commission to trainers, and charge customer cards.
Awaiting user go-ahead + confirmation of the C/D/E design below.

### Pending: Phase C (partial payments), D (commission per payment), E (Stripe #2..N), F (refund-paid fix), G (e2e)
