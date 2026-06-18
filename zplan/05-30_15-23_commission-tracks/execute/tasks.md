# Task Inventory

**Plan:** zplan/05-30_15-23_commission-tracks/plan/plan.md
**Generated:** 2026-05-30 (post-compact /execute run)
**Total tasks:** 28

## Provisional product decisions (gate Phase 3, revisit at gate)
- OQ6 sales base on credit redemption → **use totalAmount as-is** (no new column).
- OQ7 sales approval → **admin/franchisee approves** at `/dashboard/commissions/view?tab=payouts`; reuse current review permission (no separation-of-duties block).

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | Capture golden-fixture snapshot of CURRENT engine over an appointment+POS corpus (before any refactor) → `apps/server/src/tests/fixtures/commission-golden.json` | Agent A (backend) | done |
| 2 | 1 | Create `packages/services/src/commission/context.ts` — `loadCommissionContext(db,{serviceId})` (all reads + slots + member pre-fetch + latest config version) → `CommissionContext \| null` | Agent A (backend) | done |
| 3 | 1 | Create `packages/services/src/commission/plan.ts` — pure `planSplits(context,input)`; REUSE `StaffAssignment` from `commission-math.ts` (do NOT re-declare); new types `CommissionContext/PlanInput/PlannedSplit/SkipReason/RateTable/MemberSnapshot` | Agent A (backend) | done |
| 4 | 1 | Create `packages/services/src/commission/persist.ts` — `persistSplits(db,plan,ctx)` (applyCommissionCaps + 23505-safe insert + per-split audit + batched skipped audit) | Agent A (backend) | done |
| 5 | 1 | Rewrite `commission-calculator.service.ts` entry points to gather→plan→persist; DELETE `_buildSplits`; keep public signatures identical | Agent A (backend) | done |
| 6 | 1 | Re-export `commission/{context,plan,persist}` from `packages/services/src/index.ts` | Agent A (backend) | done |
| 7 | 1 | `commission/plan.test.ts` — pure unit tests for every SkipReason + redistribution + rounding (multiply-then-floor) | Agent B (test) | done |
| 8 | 1 | Behavior-diff harness: replay corpus through new pipeline, assert 0 diffs vs golden fixture (#1). Run via `run-integration-isolated.ts` | Agent B (test) | done |
| 9 | 1 | Fixture factories for `CommissionContext/PlanInput/MemberSnapshot` under `tests/helpers/` (GAPS #27) | Agent B (test) | done |
| 10 | 2 | Define enum unions in `packages/types/src/commission.ts` — roleType/basis/trigger/scope/poolPolicy/paymentType (GAPS #10) | Agent C (db) | done |
| 11 | 2 | Author `packages/db/src/migrations/tenant/0082_commission_tracks.sql` (idempotent): create commission_tracks, commission_track_rates, commission_track_versions; add roleType to trainer_tiers (NO rename, 2.1a); add nullable trackId to commission_coach_slots (additive, 2.1b); add trackId/roleType/trackVersionId to commission_splits | Agent C (db) | done |
| 12 | 2 | 2.1c — backfill track_id on legacy splits; DROP `commission_splits_so_staff_unique` → CREATE `(sales_order_id,track_id,staff_id)`; mirror appointment index → `(appointment_id,track_id,staff_id)`; VERIFY live target CHECK (0024 vs 0046) and relax if two-way | Agent C (db) | done |
| 13 | 2 | 2.2 backfill migration: per category_commission_configs → one delivery track (scope=category, roleType=trainer, trigger=on_completion, basis=delivery_total) + copy cap/floor/exclude/paymentType; repoint coach slots; tier rates→track rates; snapshot commission_track_versions; backfill trackVersionId on legacy splits. Idempotent. | Agent C (db) | done |
| 14 | 2 | `bun gen:migrations` + `bun verify:migrations` green | Agent C (db) | done |
| 15 | 2 | Drizzle schema: new commission-tracks/-track-rates/-track-versions.ts; earner-tiers re-export shim; repoint coach-slots + tier-rates; add cols to commission-splits.ts; update tenant barrel | Agent C (db) | done |
| 16 | 2 | `loadCommissionContext` resolves DELIVERY TRACK (not config); reads slots/rates/version + per-cycle cap from track tables | Agent D (services) | done |
| 17 | 2 | `persistSplits` writes trackId/roleType='trainer'/trackVersionId | Agent D (services) | done |
| 18 | 2 | 2.5 `applyCommissionCaps`: LEFT JOIN/COALESCE (NOT inner join) + `track_id` predicate in cap SUM + `SELECT … FOR UPDATE`/advisory lock for cap race (GAPS #8,#11) | Agent D (services) | done |
| 19 | 3 | 3.1 migration: add `soldBy text NULL` + `leadSourceUserId text NULL` to sales_orders; index soldBy; NO backfill | Agent E (backend) | done |
| 20 | 3 | 3.3 `commission/origination-plan.ts` (pure): net_order=totalAmount directly, gross_order=SUM(items), flat=track rate; emit SkipReason when no closer resolved (GAPS #23) | Agent E (backend) | done |
| 21 | 3 | 3.4 `calculateOriginationCommission` + wire at 2 sites: recordSale (non-Stripe confirmed, before product-only skip @pos.service.ts:963) + payment_intent.succeeded webhook; per-order once; idempotent via (order,track,staff) index | Agent E (backend) | done |
| 22 | 3 | 3.6 proportional origination clawback in reverseForRefund neighbour: `reversal = -paid × refundedAmountCents / totalAmount`; batch the reversal fetch + track_id filter (GAPS #16) | Agent E (backend) | done |
| 23 | 3 | 3.5a `commission-tracks` router folder module (list/upsertTrack/setTrackRates/setCoachSlots/deactivateTrack); register in `base-router.ts`; new permission resource `commission_track_management` in permission.service.ts; Zod money fields `z.number().int()` (GAPS #24) | Agent E (backend) | done |
| 24 | 3 | 3.2 POS checkout "Sold by" + "Lead source" selects wired through order-create input (default current member, clearable) | Agent F (frontend) | done |
| 25 | 3 | 3.5b tabbed track editor inside `components/forms/category-commission-form.tsx` (Delivery + Add track → Sales/Marketing/Referral); TanStack Form; oRPC | Agent F (frontend) | done |
| 26 | 3 | 3.7 review inbox: `listPendingReview` + `components/pages/commissions/review-tab.tsx` group by roleType/trackId + filter; NULL roleType = "delivery (legacy)" consistently across liability/payout/ledger (GAPS #22) | Agent F (frontend) | done |
| 27 | 4 | 4.1 enable roleType='marketing'/'referrer' (config options + planner reuse, flat spiff); 4.2 liabilitySummary/liabilityByStaff/listCommissionLedger segment by trackId/roleType; CSV gains track column | Agent G (backend) | done |
| 28 | 4 | 4.3 update e2e specs (liability-tab, liability-csv-export, bulk-approve-invariants) for track dimension; add e2e for track config editor + review grouping | Agent H (frontend/e2e) | done |
