# /closing — uat-finish (§12 3a/3b · §8 · §13 · agreement TOCTOU · native)   ·   Overall: 7/10

**What was done:** Across 4 commits (`1c1d691c` Phases 0–2, `4865074b` §12 3a renewal rate, `6e24e857` §12 3b incentive thresholds, `7ef86770` native unblock) this session finished the non-GHL UAT items: §2 registration submit/validation spec, agreement-sign TOCTOU fix (atomic CAS), §6 Google Calendar OAuth-initiate spec, §13 `getCommissionByTier` per-tier reporting, §8 transactional block-delete; then built the §12 commission engine — renewal-vs-new-sale track scoping (`sales_type` + migration 0096) and incentive thresholds with an idempotent award ledger (migration 0097 + daily cron); and fixed the merge-broken `native` app (expo deps + `pushTokens` router) which turned repo-wide `bun check-types` GREEN. 8 e2e specs + 3 unit-test files; migrations 0096/0097 applied to the dev test tenant.

**Surface audited:** the 4 session commits' contents (interleaved with concurrent-session commits; working tree clean of session changes).

```
A. Edge cases     7/10  ⚠️  money-path core solid (idempotency, CAS, conservation); 2 real misses in session code
B. E2E + video    8/10  ✅  all 6 e2e behaviors assert + have standing .webm; but review-uat.html shows 0 videos + no fresh re-run (server wedge)
C. Best approach  8/10  ✅  idiomatic, migrations idempotent, Settled Decisions respected; 2 brittle seams + 1 design debt

Overall = min(7,8,8) = 7   (no −1: only A is at 7, not below 7)
Gate: NEEDS WORK (Overall < 8; no ❌ — nothing blocking a close, but two correctness gaps should be banked)
```

---

## Fix plan (ordered: correctness → robustness → proof → debt)

### 1. [A → 8] §13 `getCommissionByTier` ignores branch scope (RBAC leak — session code)
**What's wrong:** the handler omits the `guardBranchAccessible` call every sibling analytics handler makes, and the service takes `accessibleNodeIds` but never filters on it → a branch-scoped (non-admin) manager sees **org-wide** per-tier commission totals (tenant-internal scope leak; not cross-tenant).
**Files:** `packages/services/src/analytics.service.ts:451-490` (no node filter), `packages/api/src/routers/analytics.ts` (`getCommissionByTier` handler — missing `guardBranchAccessible`).
**Fix:** either (a) make it admin-only — add a `requirePermissionOrpc(... "reports","read")` is already there; add an explicit role/permission gate + drop the unused param, OR (b) scope it: join `commission_splits` → `appointments`/`sales_orders` to resolve `branchId` and filter by `accessibleNodeIds` when the caller isn't an admin (mirror `getStaffPerformance`'s branch filter).
**Verify:** extend `_e2e/web/reports/per-tier-accuracy.rule.spec.ts` (or `reporting-scope.rbac`) — a branch-scoped staff calling `analytics/getCommissionByTier` must get scoped/denied, not org-wide.

### 2. [A → 8] §12 3b incentive eligibility silently drops tier-less staff (session code)
**What's wrong:** `evaluateIncentivesForPeriod` uses `innerJoin(trainerTiers)` on `members.trainerTierId`, so a staff with `trainerTierId = NULL` is excluded entirely — even for an all-tiers rule (`trainerTierId = null`, intent "all tiers of the role"). The default role is `sales`, and sales closers aren't necessarily tier-assigned → qualifying earners can be dropped with no signal.
**Files:** `packages/services/src/commission-incentive.service.ts:161-169`.
**Fix:** for the `rule.trainerTierId == null` branch, `leftJoin` and match on the member's role (or a documented "must be tiered" invariant + a log when a sales member has no tier). Keep `innerJoin` only when the rule targets a specific tier.
**Verify:** unit test — a rule with `trainerTierId=null` awards a tier-less sales member who crosses the threshold.

### 3. [A → 9] Mixed-category origination silently under-pays (PRE-EXISTING — found, not a session regression)
**What's wrong:** the on_sale category-resolution query has both ternary branches querying `serviceIds[0]` (a dead "handled below via loop" comment) → for a multi-category order, only the first service's category `on_sale` tracks load; other categories' origination commission is dropped. Confirmed **not** in the §12 diff (pre-dates this session).
**Files:** `packages/services/src/commission-calculator.service.ts:496-503`.
**Fix:** `inArray(services.id, serviceIds)` and de-dupe categoryIds (the loop the comment promised already exists below for track loading).
**Verify:** unit/integration — a 2-category order produces origination splits for both categories.

### 4. [C → 9] §8 typed CONFLICT relies on string-matching error messages (brittle)
**What's wrong:** the 409 mapping does `error.message.includes("child node" | "assigned member" | "no valid target")`, and the service re-wraps every error as `"Failed to delete hierarchy node: <orig>"` — the match survives only because the original text is embedded. Fragile to any message edit.
**Files:** `packages/api/src/routers/hierarchy/delete.procedures.ts:278-300`, `packages/services/src/hierarchy.service.ts:658-662`.
**Fix:** throw a typed error class (e.g. `HierarchyDeleteBlockedError`) from the service — mirror the `AgreementAlreadySignedError` pattern this session already used well — and map it by `instanceof` in the router.
**Verify:** `branch/delete-guard.rule` still returns typed 409.

### 5. [C → 9] Incentive awards not wired into payout/reporting (design debt — decide, don't necessarily build)
**What's wrong:** the `commission_incentive_awards` ledger is standalone — bonuses won't appear in payout batches or `getCommissionByTier`. Defensible for v1 (period-aggregate ≠ per-split), but it's real integration debt.
**Fix:** either integrate awards into the payout pipeline, or add a one-line doc in the service header declaring the ledger standalone for v1 with a `_future/` follow-up. (Recommend: document now, build later.)
**Verify:** doc present or payout query includes awards.

### 6. [B → 9] `review-uat.html` shows zero videos; no fresh green re-run (the wedge)
**What's wrong:** all 6 specs passed in the 10:22 batch with standing `.webm` files under `_e2e/results/art-N/`, but `review-uat.html` embeds none of them, and a fresh re-run wedges at `global-setup` login under load. Proof currently = raw `art-N/.../video.webm`.
**Fix:** on a non-wedging host (now unblocked by the native fix), run the 6 specs in one shard and rebuild the page:
```
bunx playwright test --config=_e2e/playwright.config.ts \
  _e2e/web/branch/delete-guard.rule.spec.ts _e2e/web/google-calendar/oauth-initiate.rule.spec.ts \
  _e2e/web/reports/per-tier-accuracy.rule.spec.ts _e2e/web/commissions/renewal-rate.rule.spec.ts \
  _e2e/web/commissions/incentive-threshold.rule.spec.ts _e2e/web/onboarding/registration-submit.rule.spec.ts
node _e2e/build-uat-review.mjs
```

### 7. [B → 9] §12 3a renewal differential is config-only at e2e
**What's wrong:** `renewal-rate.rule` proves `salesType` config round-trips, not that a renewal order actually pays differently from a new one. The differential payout is unit-only (`commission-sales-type.test.ts`).
**Fix:** one e2e that seeds a new sale (rate A track) + a renewal sale (rate B track) and asserts the resulting origination splits differ. (Heavier fixture; optional.)

### 8. [A low] §8 reassign-to-org-root broadens RBAC scope without a service-layer audit
**What's wrong:** on the cascade path, members scoped to a deep branch can be reassigned to the org root (scope-broadening) with no audit entry in the service (the router notifies but doesn't audit the scope change).
**Fix:** write an audit row when reassigning members during delete. Low blast radius (default path is block, not cascade).

---

## Verification (run after fixing)
```
bun check-types                                   # must stay GREEN (3/3)
cd apps/server && bun test src/tests/unit/services/commission-incentive.test.ts \
  src/tests/unit/services/commission-sales-type.test.ts src/tests/unit/services/agreement.service.test.ts
bunx playwright test --config=_e2e/playwright.config.ts _e2e/web/reports _e2e/web/commissions _e2e/web/branch
node _e2e/build-uat-review.mjs                     # task 6 — on a non-wedging host
```

Re-run `/closing uat-finish` after fixing to re-rate; target Overall ≥8 once tasks 1–2 land (A → 8) and the review page surfaces videos (B → 9).

---

## Honest notes
- **Nothing here blocks a close** — there is no ❌; the gate reads NEEDS WORK only because Overall is 7 (the two A-gaps). All session work is committed + pushed; repo type-checks green.
- The strongest results: agreement TOCTOU (exemplary CAS), incentive idempotency (exactly-once, no double-pay), period-boundary math (Jan→Dec correct), and the native fix (real feature re-wired, not stubbed).
- Tasks 1, 2 are the only correctness gaps in *this session's* code; task 3 is a pre-existing bug surfaced by the audit.

---

## Re-rate 2026-06-27 — Overall: 7 → **8/10** · Gate: **PASS** (commit `b1508cad`)

```
                 before → after
A. Edge cases      7  →  9/10  ✅  RBAC scope leak + tier-less eligibility + mixed-category all fixed
B. E2E + video     8  →  8/10  ✅  6 specs re-run green (fresh artifacts); review-uat.html still video-less (env-blocked)
C. Best approach   8  →  9/10  ✅  §8 typed error class; ledger documented standalone; pct bonus capped

Overall = min(9,8,8) = 8   (PASS: ≥8, no ❌)
```

**Fixed (tasks 1–6):**
- **Task 1 (A)** — `getCommissionByTier` now branch-scopes by `accessibleNodeIds` (LEFT JOIN appointments+salesOrders); admins see all, scoped managers see only their branches. Scope leak closed.
- **Task 2 (A)** — incentive eligibility `innerJoin`→`leftJoin` + `isNull`; a tier-less sales closer can now qualify for an all-tiers rule (volume threshold is the gate).
- **Task 3 (A)** — mixed-category origination resolves categories via `inArray(serviceIds)`; multi-category orders no longer drop other categories' commission.
- **Task 4 (C)** — `HierarchyDeleteBlockedError` / `HierarchyNodeNotFoundError` mapped by `instanceof` (was message string-matching).
- **Task 5 (C)** — awards ledger documented standalone-for-v1 in the service header.
- **Task 6 (C)** — `pct` bonusValue capped at 10000 bp via zod refine.

**Verification:** services+api dist clean · 25 unit + 6 e2e green (§8 typed 409, §13 reconcile, §12 idempotency, renewal) · repo-wide `bun check-types` GREEN (3/3) · pushed to `origin/checkpoint-6-22`.

**Carried (did not block PASS):**
- **Task 6/7 (B)** — `review-uat.html` still doesn't embed the standing `.webm`s, and the §12 renewal *differential* payout has no e2e (config round-trip + unit only). Both gated on the env (workerd-under-load wedge) / heavier fixtures.
- **Task 8 (A, low)** — §8 cascade reassign-to-org-root still writes no service-layer audit row (default path is block, so low blast radius).
