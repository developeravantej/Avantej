# E2E-deep — remaining coverage + follow-ups (2026-06-07)

Handoff for the tail of the `/e2e-deep` effort. The suite went from **177 covered /
42 uncovered / 22 deferred** to **235 covered / 6 deferred / 0 uncovered / 0
failing**. Everything reachable with the single dev tenant + the Stripe test sandbox
is covered. What remains needs either a standing second tenant, a subscription
fixture, or a backend procedure — none safe/sensible to leave done autonomously.

**Branch:** `test/unit-suite-green-and-ci-fix`. 12 commits, NOT pushed (`217e2dd1` …
`42c93c82`). **Session plan + proof:** `zplan/06-06_e2e-deep-close-42/` (`plan.md`,
`seeded-environment-plan.md`, `LEARNINGS.md`, `_e2e/findings.md`).

## Already done (do NOT redo)
- 42 originally-uncovered ledger rows closed (branch, members, packages,
  goods-receipts, audit, notifications, households, cancelled-sales) + refunds (7).
- **Two real bugs fixed:**
  - `cancelSalesOrder` reused an order's cancellation number instead of minting a
    second (`packages/services/src/sales-order.service.ts`) — unit + e2e covered.
  - `getWorkersEnv()` cached `undefined` at import time, breaking tenant
    provisioning (`apps/server/src/services/neon.service.ts`) — fixed + proven by an
    actual provision.
- Stripe payment rows 7/8 covered against the dev-shared TEST sandbox, incl.
  webhook-driven refund + chargeSavedCard (gated `E2E_STRIPE_WEBHOOKS=1` + `stripe listen`).
- Second-tenant harness committed (`apps/server/scripts/seed-second-tenant.ts`,
  gated `multi-tenant`/`saas` specs, global-setup `orgB-session` role).
- multi-tenant (3) + saas suspended/cancelled (1) **verified green against a real
  provisioned org B**, then torn down → they revert to deferred (re-provision to
  re-cover; deferral reasons say so).

## Remaining 6 deferred rows

### 1. multi-tenant (3) + saas suspended/cancelled (1) — verified, need a STANDING tenant
**Problem.** Covered specs exist and passed against a real org B, but org B was torn
down (billable Neon branch), so they self-skip and the rows are deferred again.
**To re-cover (persistently):** keep an org B provisioned. Recipe (full detail in
`zplan/06-06_e2e-deep-close-42/LEARNINGS.md` "Second-tenant provisioning"):
1. `bun dev` up; login `developer.avantej@gmail.com`/`password123` (super_admin) via
   `POST /api/auth/sign-in/email` (needs `Origin` header).
2. `POST /rpc/platformAdminTenants/provisionTenant {name,slug:"e2e-second-tenant",country:"MY",ownerEmail:"developer.avantej@gmail.com"}`.
3. `POST /rpc/invitations/accept {token,organizationId}` as developer (bootstraps member + hierarchy).
4. Write `_e2e/.auth/orgB.json` `{orgId}`; run `E2E_SECOND_TENANT=1 bunx playwright test … _e2e/web/multi-tenant _e2e/web/saas`.
5. Then drop the `multi-tenant`/`saas` priority-DEFERs in `_e2e/update-ledger.mjs`,
   sync, and leave org B standing (or accept they re-defer on teardown).
**Why deferred:** a standing second tenant is a billable resource — an operator decision.

### 2. saas past_due read-only (1) — needs a subscription fixture
**Problem.** `require-active-saas-sub.middleware.ts` decides read-only from a
`saas_subscriptions` row + grace deadline (subscription-based, **not**
`organizations.paymentStatus`). `--set-status` doesn't trigger it.
**Scope.** Seed a `saas_subscriptions` row for org B with status `past_due` and a
grace deadline in the past, then run with `E2E_SAAS_PASTDUE_SUBSCRIPTION=1` (the
spec `_e2e/web/saas/saas-state.rule.spec.ts` already gates on this).
**Acceptance.** read proc → 200; write proc → 403 `SAAS_PAST_DUE_READONLY`.

### 3. payment invoice create/update (1) — needs a backend procedure
**Problem.** There is **no standalone invoice create/update procedure** — invoices
are a side-effect of the Stripe payment-link flow. Not a test gap.
**Scope (a feature, not a test).** Decide whether a discrete `invoices.create/update`
oRPC procedure should exist; if yes, build it, then add an `_e2e/web/payment` lifecycle
spec and drop the invoice entry from the payment priority-DEFER.
**Out of scope:** faking coverage via the module-level ledger.

## Operational follow-up (not a coverage row, but bites every full run)
**Dev-server instability.** `wrangler dev` + vite repeatedly died mid-run under the
full serial suite (~150 specs), aborting runs and corrupting the ledger sync via a
partial `report.json`. **Fix:** run the full suite through `_e2e/shard-run.sh`
(restarts the API worker between shards). Until then, guard ledger sync on
`specs >= 140` and restore `_e2e/coverage-ledger.json`/`review.html` from git on abort.

## Acceptance criteria (whole brief)
- `node _e2e/update-ledger.mjs` reports **241 covered / 0 deferred** (or every
  remaining deferral carries an accurate, current reason).
- multi-tenant + saas (incl. past_due) specs pass with a standing org B.
- Invoice row either covered by a real procedure or formally retired from the ledger.
- A full `shard-run.sh` pass is green end-to-end without a server death.
