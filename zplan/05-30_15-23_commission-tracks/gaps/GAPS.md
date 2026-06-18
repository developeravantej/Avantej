# Swarm Audit — GAPS.md
**Session:** 05-30_15-23_commission-tracks
**Run at:** 2026-05-30 15:23 (+08)
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total findings:** 64 (8 critical · 14 high · 18 medium · 8 low · 16 info)

> **Headline:** the plan's *design* is sound, but it under-specifies the collision with **two pre-existing migration-0024 constraints** that physically block the core feature (track stacking), and its **UI journeys point at routes that don't exist**. Both were flagged independently by 2–3 lenses each. Fix the P1 block list before any `/execute`.

---

## ✅ Applied to plan.md (2026-05-30)

**Mechanical (A1–A7):** A1 migration `NNNN`→`0082`; A2 route paths corrected in Journeys A/C (→ `category-commission-form.tsx` dialog + `commissions/view.tsx`); A3 router registration → `base-router.ts`; A4 procedure name → `resolveReview`; A5 `StaffAssignment` reuse note added to §3.1; A6 §8 Q3/Q5 relabeled RESOLVED; A7 "public signatures unchanged" qualified in §6. (A8 no-op — design docs confirmed present.)

**Substantive P1/P2 revisions:** #1 + #2 → new Task **2.1c** (drop/replace the `(sales_order_id, staff_id)` unique index with a track-aware one; verify+relax the target CHECK); #8 → Task **2.5** rewritten to LEFT JOIN/COALESCE + `track_id` predicate (no cap-zeroing at cutover); #11 → Task 2.5 adds `SELECT … FOR UPDATE`/advisory lock for the cap race; #17 → new Task **2.1b** (additive coach-slot repoint, not a destructive swap); #9 → new Task **2.1a** (additive `roleType` column, NO `trainer_tiers`→`earner_tiers` rename — adopts §8 Q4's safer path); #4/#5/#14 → journeys + file targets re-pointed at real surfaces; #19 → permission resource wired into §3.5.

**Still requires manual/code judgment during `/execute` (not auto-applied):** #6 #7 (clawback + idempotency tests), #12 (golden-fixture harness before deleting `_buildSplits`), #13 (Neon-WS test transport), #16 (unbounded reversal fetch), #10 (enum unions in `packages/types/src/commission.ts`), #21 (extra indexes). These are tracked below; resolve §8 Q1/Q2 before Phase 3.

---

## Priority Fix Order

### P1 — Critical (block execution — fix before any /execute)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 1 | schema-drift + scalability | **Existing partial unique index blocks stacking.** `commission_splits_so_staff_unique ON (sales_order_id, staff_id) WHERE sales_order_id IS NOT NULL` has no track dimension. Journey B's sales-split-stacked-on-delivery for the same (order, staff) hits 23505 and is **silently dropped** by the skip handler — violates "commission must reach earners in all cases." | `packages/db/src/migrations/tenant/0024_commission_splits_status.sql:17-19` | Drop/replace the old index with `(sales_order_id, track_id, staff_id)`; backfill `track_id` onto legacy delivery rows before the swap. Add to Phase 2 migration. |
| 2 | scalability | **`commission_splits` target CHECK may forbid origination on package/installment.** §3.4 names "package purchase / installment first payment" as trigger sites. Agent cited the 0024 two-way CHECK (appointment_id XOR sales_order_id). NOTE: schema comment says migration **0046** widened it to one-of-three incl. `package_instance_id` — **verify which CHECK is live** before relying on it. If still two-way, package-instance origination throws 23514 (uncaught). | `0024:25-30` vs `commission-splits.ts:39` (0046 comment) | Verify live CHECK; if two-way, relax to allow the chosen origination target. Gated on §8 Q2. |
| 3 | type-safety | **`StaffAssignment` re-declared → duplicate identifier, fails `bun check-types`.** Plan lists it as "new" but it's already exported from `commission-math.ts:22` (and re-declared in the calculator). `plan.ts` importing math + re-declaring = compile error. | `packages/services/src/commission-math.ts:22`; `commission-calculator.service.ts:46` | Reuse the existing exported `StaffAssignment`; do not re-declare. Mechanical. |
| 4 | api-surface + doc-consistency + test-coverage | **Web route paths are fictional.** `/dashboard/settings/commissions` (Journey A) and `/dashboard/operations/commissions` (Journey C) don't exist. Real surfaces: review = `dashboard/_layout/commissions/view.tsx` (ReviewTab + LiabilityTab); config = `components/forms/category-commission-form.tsx` dialog launched from the service-category data-table. | `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx`; `apps/web/src/components/forms/category-commission-form.tsx` | Reframe Journeys A/C onto the real surfaces (per "new flow lives where the old one did"); fix Phase 3.5/3.7 file targets. |
| 5 | api-surface | **New router must register in `base-router.ts`, not `routers/index.ts`.** `routers/index.ts` only assembles server-only type stubs into `appRouter`; the real `baseRouter` (where `commissionSplits` merges) is `base-router.ts:110`. Plan never names it. | `packages/api/src/routers/base-router.ts:110` | Register `commissionTracks` in `base-router.ts`; add server-router type stub only if server-only. |
| 6 | test-coverage | **Proportional clawback formula has zero test coverage.** `reversal = -paid × refundedAmountCents / totalAmount` (3.6) untested; existing reversal tests cover only the delivery path the plan itself says doesn't cover origination. Financial mutation, no test. | new `apps/server/src/tests/` | Add unit + integration tests for origination clawback proportionality before 3.6 ships. |
| 7 | test-coverage | **Track-aware idempotency untested.** "10-session package fires sales once" (3.4) bound to no test; existing dedup test is delivery-scoped and documents its own limitation. A double-fire pays the closer N×. | new test + `0024` index dep | Add idempotency integration test once the (order, track, staff) index lands. |
| 8 | type-safety + scalability | **Per-track cap silently drops all pre-migration splits.** The `trackVersionId` INNER JOIN (modeled on the `configVersionId` join) excludes NULL-`trackVersionId` rows — i.e. **100% of existing splits** → every trainer's monthly cap resets to zero at cutover, AND the cap SUM has no `track_id` predicate so per-track caps leak across tracks. | `commission-splits.service.ts:434-446` | Use LEFT JOIN/COALESCE or backfill `trackVersionId`; add `track_id` to the cap aggregate WHERE. Make explicit in §2.5. |

### P2 — High (fix before merging)

| # | Lens | Finding | File | Fix |
|---|------|---------|------|-----|
| 9 | type-safety + schema-drift | **`trainer_tiers`→`earner_tiers` rename trips `drift-check.yml`.** `members.trainerTierId` FK target comparison vs live; a re-export shim satisfies TS but not the drift gate. | `members.ts:42`; `.github/workflows/drift-check.yml` | Adopt §8 Q4 alternative: **additive `roleType` column without rename** (safer), or fully sequence the rename + regenerate drift artifacts. |
| 10 | type-safety | **6 new text enums have no exported TS union.** roleType/basis/trigger/scope/poolPolicy/paymentType break the `CommissionEarnReason` convention and kill planner-switch exhaustiveness. | `packages/types/src/commission.ts:15` | Define unions in `packages/types/src/commission.ts`; apply via `text().$type<…>()` + `z.enum`. |
| 11 | scalability | **Cap race: SELECT-SUM-then-INSERT with no lock.** `applyCommissionCaps` reads the cycle total then inserts in a separate statement; the 23505 index guards identity, not the sum → concurrent earns for the same staff/cycle both pass and exceed the cap. Tracks worsen it. | `commission-calculator.service.ts:630-674`; `commission-splits.service.ts:434` | `SELECT … FOR UPDATE` on the aggregate scope or a per-(staff,cycle,track) advisory lock. Pre-existing bug — call out explicitly. |
| 12 | test-coverage | **Behavior-diff harness can't diff against deleted code.** Task 1.4 deletes `_buildSplits`; 1.5 wants to diff vs the "pre-refactor engine." Two live engines also collide with Bun's process-global `mock.module`. | Phase 1 tasks 1.4/1.5 | Capture a **frozen golden fixture** of real splits *before* 1.4; diff new engine against the fixture. |
| 13 | test-coverage | **`pg`-driver integration harness HANGS.** `integration-setup.ts` was migrated to a `pg` pool that hangs on rollback (per memory); clawback/idempotency tests are rollback-heavy. | `apps/server/src/tests/helpers/integration-setup.ts` | Use the Neon-serverless WS pool pattern (see `audit-prove-deferred.integration.test.ts`); document transport choice in §7. |
| 14 | api-surface + doc-consistency | **Journey A flow contradicts the embedded-form reality.** "navigate to settings → select category → see tabs" vs the actual `category-commission-form.tsx` dialog. | `components/forms/category-commission-form.tsx` | Rewrite Journey A as a tabbed extension of the existing dialog, or justify a new page. |
| 15 | type-safety | **`as unknown as` casts in touched files + cold-build AppRouter risk.** Existing casts at `commission-splits.service.ts:964,1347`; new `commission-tracks` router may re-trigger the documented TS instantiation-depth blowup on cold `tsc -b`. | `commission-splits.service.ts:964,1347` | Apply the `_appRouter as unknown as AppRouter` pattern (memory); avoid widening casts in `persist.ts`. |
| 16 | scalability | **`reverseForRefund` clawback fetch is unbounded `IN (orderIds)`** and grows multiplicatively with stacked tracks. | `commission-splits.service.ts:2114-2119` | Batch/paginate the reversal fetch; add `track_id` filter. |
| 17 | schema-drift + scalability + doc | **Coach-slot repoint is destructive + drops index migration.** `commission_coach_slots.configId` is NOT NULL with cascade FK + `(configId, slotIndex)` unique index; plan treats repoint casually and omits migrating `coach_slots_config_slot_unique` to `trackId`. | `commission-coach-slots.ts:6-8,14` | Sequence add-nullable `trackId` → backfill → keep-both → drop later; migrate the unique index to `(trackId, slotIndex)`. |

### P3 — Medium (fix before shipping)

| # | Lens | Finding | Fix |
|---|------|---------|-----|
| 18 | schema-drift + api + doc | `NNNN` migration placeholder → next free tenant number is **0082** (registry ends at `0081_credit_point_ledger`). | Replace placeholder; confirm against on-disk + memory. |
| 19 | api-surface | `commission_track_management` absent from `Resource` union. | Add at `permission.service.ts:47-51` + seed alongside `category_commission_management`. |
| 20 | api-surface | Procedure key is `resolveReview`, not `resolvePendingReview` (that's the service fn). | Correct the plan's procedure name. |
| 21 | scalability | Missing indexes: review grouping needs `(status, role_type, track_id)`; cap aggregate hot path needs `(staff_id, earned_at)` + `track_version_id`. | Add to Phase 2/3 index set. |
| 22 | type-safety | "treat NULL `roleType` as delivery" applied only to review grouping, not liability/payout/ledger. | Apply the rule consistently across all readers. |
| 23 | type-safety | `soldBy` null-guard + origination `SkipReason` for missing beneficiary not specified. | Emit SkipReason (never silent drop) when no closer resolved. |
| 24 | type-safety | Zod money-field types unpinned for the config router (must be `z.number().int()`). | Pin integer-cents / basis-point Zod shapes. |
| 25 | doc-consistency | "cap moved from config→track" wording conflicts with the dual config/track cap path §2.5/§6 require. | Clarify: track caps for new rows, config-version path retained for historical. |
| 26 | doc-consistency | "signatures unchanged through P2" true only for public arity; internal context resolution + 3 new columns + tier rename do change. | Reword to "public signatures unchanged." |
| 27 | test-coverage | New `CommissionContext`/`PlanInput`/`MemberSnapshot` have no test factory. | Add fixture factories under `tests/helpers/`. |
| 28 | test-coverage | `origination-plan.ts` fixtures depend on unresolved §8 Q1 (is `totalAmount` net?). | Resolve Q1 before writing planner tests. |
| 29 | scalability | Per-track context load is ~3×N_tracks queries/sale (bounded but §7.3 mis-states as "one query each"). | Correct §7.3; consider a single joined config fetch. |

### P4 — Low / Info (collapsed)

- **LOW** — §8 Q3/Q5 are already-decided but labeled "open" (doc-consistency). · CSV-export spec hard-codes the "Trainer" header → guaranteed edit in 4.2, not optional (test-coverage). · `RateTable` needs a discriminant; `PlannedSplit.trainerTierId` should be `string | null` (type-safety). · FK-needs-CONSTRAINT rule reaffirmed — track→tier FKs correctly target `earner_tiers.id` PK, never `name` (schema-drift).
- **INFO / verified-good** — All cited service symbols exist at claimed locations (`_buildSplits`, both entry points, `applyCommissionCaps`, `reverseForRefund`, `getLatestConfigVersionForCategory`, `listPendingReview`, `LIABILITY_BY_STAFF_LIMIT=500`). · `sales_orders.totalAmount/cancelledAmount/refundedAmountCents`, `commission_splits.configVersionId/trainerTierId`, all five copied `category_commission_configs` fields, `payment_items.promotionId` all confirmed present. · Cross-DB refs correctly plain `text`; all proposed FKs target PKs; no index-name collisions. · P1→P2→P3(3.1 gates 3.2–3.4)→P4 dependency chain is sound. · §2↔§4↔§5 map cleanly. · Multi-tenant isolation correct (all new queries on `tenantDb`). · Origination beneficiary resolution is a single lookup (no N+1); track lists genuinely small (pagination N/A holds). · Both calculator entry points have exactly 2 callers (`appointment.service.ts:1046`, `pos.service.ts:1005`).
- **FALSE POSITIVE (corrected)** — doc-consistency flagged `_design/commission-calculator-refactor.html` + `_design/commission-architecture-brainstorm.html` as missing. **They exist** at the project root (`_design/`, created this session); the agent searched the session folder. No action.

---

## Lens Summary

| Lens | Critical | High | Medium | Low | Info | Status |
|------|----------|------|--------|-----|------|--------|
| schema-drift | 2 | 3 | 3 | 1 | 2 | ⚠ 2 hard blockers |
| api-surface | 0 | 3 | 3 | 2 | 1 | ⚠ wiring/route gaps |
| test-coverage | 2 | 4 | 3 | 1 | 1 | ⚠ financial paths untested |
| doc-consistency | 0 (1 FP) | 1 | 4 | 3 | 2 | ✓ structure sound |
| type-safety | 1 | 3 | 5 | 2 | 2 | ⚠ duplicate type + enum unions |
| scalability | 2 | 3 | 2 | 1 | 1 | ⚠ constraint collisions + cap race |

---

## Token Cost Estimates

| Fix group | Files affected | Est. tokens | Notes |
|-----------|---------------|-------------|-------|
| P1 plan edits (routes, migration #, StaffAssignment, index/CHECK reconciliation, cap-trap wording) | plan.md only | 1,500–2,500 | All edits to the plan doc; no code yet |
| Reframe Journeys A/C onto real surfaces | plan.md | 600–900 | §4 rewrite |
| Define enum unions + reuse StaffAssignment (when executed) | `packages/types/src/commission.ts`, `commission/*.ts` | 800–1,200 | Phase 1/2 code |
| Migration sequencing (index swap, coach-slot repoint, CHECK relax) | 1 new SQL + `.generated.ts` | 1,000–1,800 | Phase 2 |
| Test additions (clawback, idempotency, golden-fixture harness) | 3–4 new test files | 2,500–4,000 | Phases 1/3 |
| **Total to make plan execution-ready (doc edits only)** | plan.md | **~3,500–5,000** | Code fixes happen during /execute |

---

## Auto-fixable findings (safe for `--apply`)

Purely mechanical edits to `plan.md` — no judgment required.

| # | Lens | Finding | Location | Mechanical fix |
|---|------|---------|----------|----------------|
| A1 | schema-drift | `NNNN_commission_tracks.sql` placeholder | plan.md §5 Phase 2.1 | Replace `NNNN` → `0082` |
| A2 | api-surface | Wrong route paths in Journeys A/C + Phase 3 files | plan.md §4, §5.3 | `/dashboard/settings/commissions` → `dashboard/_layout/commissions/view.tsx` + `components/forms/category-commission-form.tsx`; `/dashboard/operations/commissions` → `dashboard/_layout/commissions/view.tsx` |
| A3 | api-surface | Router registration target | plan.md §3.4, §5.3 | `routers/index.ts` → `base-router.ts:110` |
| A4 | api-surface | Procedure name | plan.md §3.4 | `resolvePendingReview` (proc) → `resolveReview` |
| A5 | type-safety | `StaffAssignment` listed as new | plan.md §3.1 | Note: reuse existing export from `commission-math.ts`, do not re-declare |
| A6 | doc-consistency | §8 Q3/Q5 mislabeled open | plan.md §8 | Mark Q3 (per-track cap) and Q5 (poolPolicy shared deferred) as Resolved |
| A7 | doc-consistency | "signatures unchanged" overstated | plan.md §5 Phase 2, §6 | Qualify to "public signatures unchanged" |
| A8 | schema-drift | `_design` paths (false-positive note) | plan.md line 3 | No change — confirmed present; optionally note absolute root path |

**Findings NOT auto-fixable (need code/design judgment during execution):** #1, #2, #6, #7, #8, #11, #12, #13, #16, #17, #21 — these require migration sequencing, lock strategy, test authoring, or schema reconciliation, not plan-text edits.

---

## Recommended next action

1. **`--apply`** the 8 auto-fixable doc edits (A1–A8) to make the plan internally accurate.
2. **Manually revise §3.4 + §4 + Phase 2 migration** for the two constraint blockers (P1 #1, #2, #8, #17) and the cap race (#11) — these are the real "the plan would fail on deploy" items.
3. ✅ **DONE — §8 Q1 & Q2 resolved against code (2026-05-30).** Q1: `sales_orders.totalAmount` is net (pre-tax, post-discount, post-credit-redemption) — use directly for `net_order`. Q2: origination fires per-order at two sites — `recordSale` (non-Stripe confirmed, before the product-only skip at `pos.service.ts:963`) and the `payment_intent.succeeded` sales-order webhook (Stripe pending→completed). Only residual is a finance confirmation on whether credit-point redemption should shrink the sales base.
