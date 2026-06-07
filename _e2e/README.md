# `_e2e/` — dashboard E2E suite (Playwright)

Module-grouped, video-recorded, reviewable E2E suite. Specs on disk are the
**source of truth** for what tests exist; everything else is derived.

## Run it

```bash
# 1. servers up (web:3021 + api:3020)
bun dev

# 2. one-time: seed the non-admin staff user used by the RBAC specs
cd apps/server && bun run scripts/seed-e2e-staff.ts

# 3. run the FULL suite (writes _e2e/results/report.json + videos)
bunx playwright test --config _e2e/playwright.config.ts

# 4. build the review page SAFELY (guards against a partial report, then generates)
node _e2e/build-review.mjs        # -> _e2e/review.html  (open in a browser)
```

> Always use `build-review.mjs`, not gen-review directly. It refuses to build
> `review.html` from a partial/stale `report.json` — the trap where running one
> module overwrites the report and the page silently drops every other test.

## Drift guard — never silently lose tests/coverage

`report.json` is **overwritten** every run (not merged), so the review page is a
snapshot of the **last full run**. `node _e2e/reconcile.mjs` keeps the four moving
parts honest:

| Source (committed) | Checked against |
|---|---|
| specs on disk (`web/**/*.spec.ts`) | the report, journeys, and ledger |

```bash
node _e2e/reconcile.mjs          # full check (report-aware) — run before reviewing
node _e2e/reconcile.mjs --static # CI mode (no report.json needed) — runs in ci.yml
node _e2e/reconcile.mjs --prune  # remove journey entries orphaned by a rename/delete
```

It fails (exit 1) on: a **partial/stale report** (tests on disk missing from the
report), **orphaned journeys** (test renamed/deleted, journey left behind), or a
**ledger row claiming coverage for a spec that no longer exists**. CI runs the
`--static` subset on every PR (`e2e-reconcile` job) so drift can't be merged.

### When you rename or delete a spec
- **Rename:** update its `journey-steps.json` key + any `coverage-ledger.json`
  `specFile`, then `node _e2e/reconcile.mjs --prune` to drop the old journey.
- **Delete (intentional):** remove its journey (`--prune`) and set its ledger
  row back to `uncovered`/`deferred`. Reconcile fails hard until you do — by
  design, a coverage drop should be a visible, deliberate diff.

## Files

| File | Role |
|---|---|
| `web/<module>/*.spec.ts` | the tests (smoke + lifecycle + rule + rbac + detail) |
| `web/_helpers.ts`, `web/_safe-mutation.ts` | shared helpers (`smokeLoad`, `rpc`, `getOrgId`, `getUomId`, `testId`…) |
| `web/global-setup.ts` | multi-role login → `.auth/{admin,staff}.json` + `.auth/org.json` |
| `journey-steps.json` | `"<relpath>::<title>" → steps[]` shown on each card |
| `coverage-ledger.json` | 241 ops+invariants with status + specFile (the coverage contract) |
| `strategy.md`, `findings.md` | the plan and the issues found |
| `reconcile.mjs`, `build-review.mjs` | drift guard + safe review-page build |

## Known fragility (not yet fixed)
The **"Reviewed" checkboxes** live only in the browser's `localStorage`
(keyed by `"<relpath>::<title>"`). They survive page regeneration, but are **not
portable**, have **no audit trail**, and **reset if a test is renamed** or browser
data is cleared. If review marks need to be durable/shared, move them to a
committed `review-state.json` keyed by a stable `// @e2e-id <ulid>` per spec
(decouples identity from title/path). Deferred — only worth it if humans review
regularly. See `findings.md`.

## Stripe webhook-driven payment specs

`web/payment/stripe-webhook.rule.spec.ts` (actual refund + chargeSavedCard) needs the
Stripe CLI listener forwarding connect events to the dev server, and a flag:

```bash
# 1. listener (uses the sk_test_ key already in apps/server/.dev.vars; its signing
#    secret matches STRIPE_*_WEBHOOK_SECRET, so no restart needed)
stripe listen --api-key sk_test_... \
  --forward-to localhost:3020/webhooks/stripe/platform \
  --forward-connect-to localhost:3020/webhooks/stripe/connect

# 2. run with the flag (without it, these two specs self-skip)
E2E_STRIPE_WEBHOOKS=1 bunx playwright test --config _e2e/playwright.config.ts
```

All test-mode (`pm_card_visa`); no real money moves; appointments are disposable.
