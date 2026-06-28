# UAT finish — §12 commission engine + §8/§13 + agreement TOCTOU + native unblock

- **Session id:** cd52da71-91b3-4db5-ba44-e874f34076f0
- **Date:** 2026-06-27 17:55
- **Branch:** checkpoint-6-22 @ b1508cad
- **Status:** in-progress
- **/closing:** Overall 8/10 (A 9 · B 8 · C 9) — PASS (re-rated from 7)

## Scope
Drive every non-GHL UAT item to covered. Started by checking the `_close`/ledger ("are those things built?"), then: proved the items that were already built but unverified (§2 registration, §6 Google Calendar connect), built the missing reporting/fix items (§13 per-tier, §8 transactional delete, agreement TOCTOU), and built the one genuine remaining feature — **§12 commission incentive + renewal engine** — as its own planned phase. Then fixed the merge-broken `native` app to turn repo CI green, attempted (unsuccessfully) to regenerate the full-suite UAT video page, and ran `/closing` → fixed all surfaced gaps → re-rated to PASS.

## What was done
- **Phase 0 proofs + fixes** (`1c1d691c`): §2 registration submit/validation spec (`onboarding/registration-submit.rule`); agreement-sign **TOCTOU** → atomic compare-and-set (`agreement.service.ts`); §6 Google Calendar **OAuth-initiate** spec (connect half proven, no creds); **§13 per-tier reporting** `analytics.getCommissionByTier` + spec; **§8 transactional block-delete** (`hierarchy.service.ts` wrapped in one tx, subtree-wide member handling, router default → block, typed 409). Folded in the prior session's uncommitted lifecycle specs the ledger cites.
- **§12 3a renewal** (`4865074b`): `commission_tracks.sales_type` (new|renewal|any) + migration **0096**; engine `selectTracksBySalesType` + on-the-fly renewal detection (returning-customer = prior confirmed order) in `planOriginationForOrder`; threaded through tracks service + upsertTrack proc. 7 unit + e2e.
- **§12 3b incentive** (`6e24e857`): `commission_incentives` (rules) + `commission_incentive_awards` (idempotent ledger, UNIQUE(rule,staff,period)) + migration **0097**; `evaluateIncentivesForPeriod` (ON CONFLICT DO NOTHING) + pure `computeIncentiveBonusCents`/`monthlyPeriodKey`; `commissionIncentives` router; daily `incentive-sweep` cron (previous closed month). 9 unit + e2e (sweep twice → 2nd creates 0).
- **native unblock** (`7ef86770`): installed `expo-device`/`expo-notifications` (SDK-54), re-exported `push-token.service` + registered the orphaned `pushTokens` router → `client.pushTokens` resolves. Repo-wide `bun check-types` GREEN (3/3), `bun dev` boots all three apps.
- **/closing fix-pass** (`b1508cad`): §13 `getCommissionByTier` RBAC branch-scoping (was org-wide leak for scoped managers); §12 3b eligibility `innerJoin`→`leftJoin`+`isNull` (tier-less closer no longer dropped); pre-existing mixed-category origination `inArray(serviceIds)` fix; §8 typed `HierarchyDeleteBlockedError`/`HierarchyNodeNotFoundError` mapped by `instanceof`; incentive ledger documented standalone-v1; pct bonus capped 10000 bp.

## Files changed
Session commits span ~55 files: services (`agreement`, `analytics`, `hierarchy`, `commission-calculator`, `commission-tracks`, `commission-incentive`), api routers (`analytics`, `commission-tracks/mutate`, `commission-incentives`, `hierarchy/delete`, `base-router`), db (schemas `commission-tracks`/`commission-incentives` + migrations 0096/0097 + generated bundle + barrel), types (`commission`), server (`incentive-sweep.service`, cron in `index.ts`), native (`package.json` + `bun.lock`), 9 e2e specs + 3 unit-test files, `_e2e/uat-ledger.json`, `_e2e/shard-run.sh`, `zplan/2026-06-24-uat-finish/`.

## Commits
```
b1508cad fix(commission,hierarchy): /closing fix-pass — RBAC scope, incentive eligibility, mixed-category, typed delete errors
7ef86770 fix(native): restore push-notification deps + wire pushTokens router (unbreak bun dev + repo check-types)
6fec7f9d chore(e2e): add web/onboarding to UAT shard dirs + record §12 execution log
6e24e857 feat(commission): §12 3b — incentive thresholds with idempotent award sweep (UAT §12)
4865074b feat(commission): §12 3a — renewal-vs-new-sale rate scoping (UAT §12)
1c1d691c feat(uat): finish non-GHL UAT items — §2/§6/§13 proofs + §8 transactional delete + agreement TOCTOU
```
All pushed to `origin/checkpoint-6-22` (interleaved with concurrent-session commits de875b5f/10c8298f/f17114cf/178b9314).

## Commands run
- `bun gen:migrations` / `bun verify:migrations` → 0096+0097 bundled + in sync.
- `migrate-all-tenants.ts --filter=test-fitness-franchi` → 0096, 0097 applied to the **dev test tenant** (prod NOT rolled out).
- services+api `bun run build` (tsdown) → clean after each phase.
- `bun check-types` → **GREEN 3/3** (native fix cleared the merge RED).
- Unit: agreement(9), commission-sales-type(7), commission-incentive(9) + fix-pass re-run 25 pass.
- e2e (per-spec/small-batch): onboarding+gcal+reports(9), branch §8(2), commissions(9), fix-pass(6) — all green with standing `.webm` in `_e2e/results/art-N/`.

## Decisions
- **§12 renewal** computed on-the-fly from the orders ledger (not a stored flag) — single source of truth, no drift on void/backdate.
- **§12 renewal scoped to origination** (closer pays differently) not delivery (trainer work is identical) — bounded to one engine insertion point.
- **Incentive awards = standalone ledger** (not commission_splits) for v1 — period-aggregate ≠ per-split; documented as deliberate, payout integration is a follow-up.
- **§8 default = block** (not cascade) per user sign-off; cascade kept as explicit opt-in. No web caller depended on the old cascade default.
- **native fix** = re-wire the already-built pushTokens feature, not stub it.

## Open threads
- **review-uat.html not regenerated** — full-suite run wedges (`workerd` under sustained Playwright load) + Windows bash-loop fragility; videos exist as raw `_e2e/results/art-N/*.webm` but the page embeds none. Re-run `bash _e2e/shard-run.sh` on a non-wedging host (now unblocked by the native fix).
- **Prod-tenant migration rollout** (0095/0096/0097) — applied to dev only; prod needs control-panel creds.
- **§6 full OAuth round-trip** — needs a real Google Cloud OAuth app; **§1/§10 GHL** — needs a sub-account.
- **§12 renewal *differential* e2e** — current e2e is config round-trip + unit only; no e2e drives a renewal order to a different payout (heavier fixture).
- **§8 cascade reassign-to-org-root** writes no service-layer audit row (low — default path is block).
- Fix plan + re-rate scorecard: `_close/closing-2026-06-27_17-35_uat-finish.md`.
