# Scalability Audit
**Session:** 05-30_15-23_commission-tracks
**Findings:** 9 (2C · 3H · 2M · 1L · 1I)

## Findings

### [CRITICAL] Existing `commission_splits_so_staff_unique (sales_order_id, staff_id)` blocks track stacking AND breaks origination idempotency design
**Plan claims:** §3.4 / §7.6 / §6 (impact table) — track-aware idempotency is achieved by adding a partial unique index `commission_splits_origination_unique ON (sales_order_id, track_id, staff_id) WHERE track_id IS NOT NULL`, keeping 23505 skip-on-duplicate. Journey B / Phase-3 acceptance explicitly require "the closer gets a pending sales split **stacked on** the trainer's delivery split" for the same order.
**Actual:** There is already a partial unique index `commission_splits_so_staff_unique ON commission_splits(sales_order_id, staff_id) WHERE sales_order_id IS NOT NULL` (migration `0024_commission_splits_status.sql:17-19`, documented in `commission-splits.ts:9-10,117`). This index keys on **(order, staff)** with NO track dimension. Two consequences the plan never addresses:
  1. **Stacking is physically impossible** when the same person is both trainer and closer on one order: the first split (delivery) inserts; the second (sales) hits 23505 on `commission_splits_so_staff_unique` and is silently skipped by the existing 23505-handler — the closer's sales commission is **silently dropped**, directly violating the domain invariant "commission must reach earners in all cases" (§Domain Brief). The plan's NEW index is additive; it does not relax the OLD one.
  2. Even for distinct people, every POS delivery split already consumes the `(order, staff)` slot, so the plan's `(order, track, staff)` index is necessary-but-not-sufficient — the old index must be **dropped/replaced** to widen uniqueness to include `track_id`.
**File:** `packages/db/src/migrations/tenant/0024_commission_splits_status.sql:17-19`; `packages/db/src/schema/tenant/commission-splits.ts:115-117`; plan.md §3.4 (line 270), §7.6 (line 330), Journey B acceptance (line 276)
**Fix:** Phase 3 migration must DROP `commission_splits_so_staff_unique` and replace with a track-aware partial unique that also covers legacy delivery rows, e.g. two indexes: `(sales_order_id, staff_id) WHERE track_id IS NULL` (legacy/delivery) + `(sales_order_id, track_id, staff_id) WHERE track_id IS NOT NULL`. Add an explicit data-migration step: backfill `track_id` onto existing delivery splits BEFORE creating the new constraint, or the WHERE-NULL legacy index will still collide once delivery becomes a track (Phase 2 sets `roleType='trainer'` but does the delivery split get a non-null `track_id`? §2.4 says yes — so delivery splits will have `track_id IS NOT NULL` and the `(order, track, staff)` index covers them, but the OLD `(order, staff)` index still blocks them). This sequencing must be written explicitly; it is currently absent.

---

### [CRITICAL] `commission_splits_must_target_one` CHECK constraint forbids any origination split not tied to exactly one of appointment/sales_order — package & installment origination triggers will throw
**Plan claims:** §3.4 names the on-sale trigger sites as "order paid / **package purchase** / **installment first payment**". §4.1 (Phase 4) reuses `leadSourceUserId` for referral. Origination splits are assumed insertable carrying `trackId`/`roleType`/`salesOrderId`.
**Actual:** `commission_splits` has `CONSTRAINT commission_splits_must_target_one CHECK ((appointment_id IS NOT NULL AND sales_order_id IS NULL) OR (sales_order_id IS NOT NULL AND appointment_id IS NULL))` (migration `0024:25-30`). Exactly one of the two must be set; **package-instance / installment-driven** origination has no `sales_order_id` (packages are bought via `package_instances`, not always a `sales_order`). `createCommissionSplit` already supports `packageInstanceId` (`commission-splits.service.ts:477,495`) but that column is **not** in the CHECK's allowed combinations — meaning the existing CHECK is already inconsistent with `packageInstanceId` splits, and the plan's package-origination path will violate it (insert throws 23514, not 23505 — NOT caught by the skip handler, so the on-sale path will hard-fail).
**File:** `packages/db/src/migrations/tenant/0024_commission_splits_status.sql:25-30`; `packages/services/src/commission-splits.service.ts:474-499`; plan.md §3.4 (line 270), §8 Q2 (line 341)
**Fix:** Phase 3 migration must relax `commission_splits_must_target_one` to permit `package_instance_id` as a third mutually-exclusive target (and confirm origination on a package writes a row keyed on `package_instance_id`, not a phantom `sales_order_id`). Resolve §8 open-question #2 (exact on-sale site) BEFORE 3.4, because the answer dictates which column the split hangs on and therefore which CHECK arm and which unique index apply.

---

### [HIGH] Per-cycle cap aggregate is per-(staff, category) and IGNORES track — under concurrent inserts AND across tracks the cap can be bypassed
**Plan claims:** §3.3 moves `maxPerCycleCents` onto the track ("per-track cap"); §2.5 updates `applyCommissionCaps` to "aggregate per `trackId` (per-track cap) via the `trackVersionId` INNER JOIN analog". §7.6 asserts the cap read-then-write is "already mitigated by 23505 partial-unique + skip; per-track cap keeps the same guard. No new read-modify-write outside that." §8 Q3 pins caps to per-track.
**Actual:** Two distinct problems.
  (a) **Race not closed (pre-existing, plan does not fix):** `applyCommissionCaps` does `SELECT COALESCE(SUM(...))` then decides cap in app code, then a SEPARATE `INSERT` happens back in `_buildSplits` (`commission-calculator.service.ts:630-674`). There is NO `SELECT … FOR UPDATE`, no serializable txn, no advisory lock. The 23505 partial-unique only prevents **duplicate (order/appt, staff)** rows — it does NOT serialize *distinct* splits that both read the same pre-cap SUM. Two concurrent appointment completions for the same staff in the same cycle each read `alreadyCents=X`, each compute `remaining`, and both insert → combined total exceeds `maxPerCycleCents`. §7.6's claim that 23505 mitigates this is **false**: the unique index is on identity, not on the cap sum. Tracks make this worse (more concurrent earn events per staff).
  (b) **Cap currently aggregates per category, plan must add a track filter:** the SUM joins `categoryCommissionConfigVersions` and filters `categoryCommissionConfigVersions.categoryId = categoryId` (`commission-splits.service.ts:434-446`). It does NOT filter by track. When delivery + sales both exist under one category, the per-track cap the plan promises will sum ACROSS tracks unless §2.5's `trackVersionId`-join rewrite also adds `AND track_id = ?` (or `trackVersionId.trackId = ?`). The plan describes the join swap but never states the SUM's WHERE gains a `track_id`/`trackVersionId.trackId` predicate — so as written a sales split would count against the delivery cap and vice-versa.
**File:** `packages/services/src/commission-splits.service.ts:387-464`; `packages/services/src/commission-calculator.service.ts:630-674`; plan.md §2.5 (line 258), §7.6 (line 330)
**Fix:** (a) Acknowledge the cap is best-effort under concurrency and either (i) accept slight overshoot and reconcile in the payout batch, or (ii) wrap the cap read + insert in one txn with `SELECT … FOR UPDATE` on a per-(staff, cycle, track) lock row or a Postgres advisory lock keyed on `hashtext(staff||cycle||track)`. Document the chosen guarantee — currently the plan over-claims correctness. (b) §2.5 task must explicitly add `AND categoryCommissionConfigVersions/commissionTrackVersions.trackId = <track>` to the cap SUM's WHERE, and the audit findings note `track_id`-less aggregation as a defect.

---

### [HIGH] `loadCommissionContext` resolving N enabled tracks each with its own rate query is N+1 by track; plan's §7.3 only reasons about delivery
**Plan claims:** §7.3 "`loadCommissionContext` batch-fetches members + all slots/rates in one query each. … Confirm the per-staff loop in persist remains the only DB-in-loop." §3.1 shows a single `CommissionContext`. §3.2/§3.3 say a category "resolves its enabled tracks" and each track is a planner with "its own rate table".
**Actual:** Today there is exactly ONE config per category, so one rate query (`commission-calculator.service.ts:112-115`). With tracks, a category has many `commission_tracks`, and §3.3 gives each track its own `commission_track_rates` (UNIQUE(trackId,tierId)) + its own `commission_track_versions`. §3.4/§2.4 say "resolve tracks and run one planner per track." If each track's planner calls a per-track `loadCommissionContext` (rates query + slots query + latest-version query), that is **3 × N_tracks** queries per sale, not the "one query each" §7.3 claims. This is bounded (tracks "provably small", §7.1) and therefore acceptable, but §7.3 understates it and provides no batching guidance. Risk grows if a tenant enables delivery+sales+marketing+referrer (4 tracks → 12 queries/sale on a hot path that already does ~8).
**File:** plan.md §7.3 (line 327), §3.4 (line 196), §2.4 (line 257); `packages/services/src/commission-calculator.service.ts:112-170`
**Fix:** Either batch the per-track reads (single `IN (trackIds)` query for rates, one for slots, one windowed latest-version per track via `DISTINCT ON`) in `loadCommissionContext`, OR explicitly document in §7.3 the bound as "≤ 3 × maxEnabledTracks queries per sale, tracks capped at K". Note it as accepted-N, not "one query each".

---

### [HIGH] Proportional clawback (`reverseForRefund` neighbour) does an unbounded `findMany`/whole-order split fetch with no LIMIT
**Plan claims:** §3.6 extends `reverseForRefund` for origination clawback. §7 (perf checklist) does not mention the reversal path's fetch shape at all. §7.7 says "Origination split insert + reversal both transactional."
**Actual:** `reverseForRefund` already does `SELECT * FROM commission_splits WHERE sales_order_id IN (orderIds)` with NO limit (`commission-splits.service.ts:2114-2119`), and a full-order branch fetching ALL splits for the order (line 2121+). Today an order has few splits (≤ coach count). Once tracks stack delivery + sales + marketing + referrer splits PER LINE across multi-line orders, the unbounded fetch grows multiplicatively (lines × tracks × beneficiaries). The plan adds clawback rows on top without bounding or paginating this fetch, and §3.6's proportional formula `reversal = -paid × refundedAmountCents / totalAmount` reads `paid` from these in-memory rows — a wide order is loaded fully into JS.
**File:** `packages/services/src/commission-splits.service.ts:2114-2122`; plan.md §3.6 (line 272), §7 (no coverage)
**Fix:** Add the clawback fetch to §7's checklist with an explicit bound; scope the split fetch to the specific refunded `sales_order_item`s / track (the code at 2109-2113 admits `commission_splits` doesn't store `salesOrderItemId` — tracks should add it, or scope by `track_id` + line). At minimum cap and assert the per-order split count is bounded by (lines × maxBeneficiaries × tracks) and document it.

---

### [MEDIUM] `listPendingReview` track/roleType grouping rides on per-row correlated subqueries; new GROUP BY roleType/trackId has no index named
**Plan claims:** §3.4/§7.2 review grouping is "in WHERE/GROUP BY — no in-memory filtering"; §7.4 adds `commission_splits(track_id)` for review grouping. §7.1 says review list already paginates.
**Actual:** `listPendingReview` filters scope via **correlated subqueries per candidate row** — `(SELECT branch_id FROM appointments WHERE id = ...)` and `(SELECT branch_id FROM sales_orders WHERE id = ...)` inside an `inArray` (`commission-splits.service.ts:2370-2382`). This runs the subquery for each row scanned for the COUNT (line 2385-2388, no limit on the COUNT) and the windowed rows. Adding a `GROUP BY roleType/trackId` or per-group counts (Journey C shows "headers with counts") layered on top of this correlated-subquery scan, plus the plan's own `commission_splits(track_id)` index, leaves the `roleType` grouping column **uncovered** — §7.4 indexes `track_id` but not `roleType`, and the denormalized `roleType` column (§3.3) is precisely what review grouping keys on (§3.4: "return roleType/trackId on each row", Journey C groups by track). The COUNT query also has no upper bound and the correlated subqueries make it O(rows × subquery).
**File:** `packages/services/src/commission-splits.service.ts:2370-2401`; plan.md §3.4 (line 199), §7.4 (line 328)
**Fix:** Add a composite index covering the review grouping: `commission_splits(status, role_type, track_id)` (status is the primary filter, line 2399). Consider denormalizing `branch_id` onto `commission_splits` to kill the correlated subqueries (separate concern, pre-existing). Add `role_type` to §7.4's index list explicitly.

---

### [MEDIUM] Cap aggregation index for `(trackId, trackVersionId)` not in §7.4 index set
**Plan claims:** §2.5 cap aggregation INNER JOINs `commission_splits` against `commission_track_versions` on `trackVersionId` and filters per cycle. §7.4 lists new indexes: `commission_track_versions(trackId, versionNumber)` and `commission_splits(track_id)`.
**Actual:** The cap SUM filters `commission_splits` by `staffId`, `status != void`, `earnedAt` range, and (per this audit's HIGH finding) must add `trackId`/`trackVersionId.trackId`. The existing category-cap query relies on the `categoryCommissionConfigVersions` join + a scan filtered by `staffId`+`earnedAt`. There is no index named for the new track-cap aggregate's hot columns: `commission_splits(staff_id, earned_at)` partial/composite, nor `commission_splits(track_version_id)` for the new INNER JOIN. §7.4's `commission_splits(track_id)` is for review grouping, not the cap join. The cap query runs on EVERY automatic split insert (hot path) — an unindexed `staff_id + earned_at + track_version_id` scan degrades as `commission_splits` grows (this table is append-heavy: 10-session packages × tracks).
**File:** plan.md §7.4 (line 328), §2.5 (line 258); `packages/services/src/commission-splits.service.ts:426-446`
**Fix:** Add `commission_splits(staff_id, earned_at)` (covers cap SUM windowing) and ensure the `track_version_id` FK/join column is indexed (`commission_splits(track_version_id)`), mirroring the existing `configVersionId` join. List both in §7.4.

---

### [LOW] `sales_orders(soldBy)` index named, but origination beneficiary resolution & `net_order` derivation not bounded/specified
**Plan claims:** §3.1 indexes `sales_orders(soldBy)`. §3.3 origination planner resolves "one beneficiary → no loop" (§7.3). §3.3 `net_order` basis = `sales_orders.totalAmount` or "derive net from line items minus promotions".
**Actual:** Beneficiary resolution is a single lookup (closer = `soldBy`) — confirmed bounded, no N+1. The `soldBy` index is appropriate for the liability-by-staff/reporting join. However the FALLBACK net-derivation ("line items minus `payment_items.promotionId` discounts", §8 Q1) would, if taken, scan all `sales_order_items` + `payment_items` per sale — bounded by lines but unindexed for the promotion join, and the plan defers resolving whether `totalAmount` is post-discount (§8 open Q1) past the point where the index decision is made. Low because lines are few and it's gated on an open question.
**File:** plan.md §3.1 (line 267), §3.3 (line 269), §8 Q1 (line 340)
**Fix:** Resolve §8 Q1 before 3.3; if derivation is needed, confirm `sales_order_items(sales_order_id)` and any `payment_items(sales_order_id/promotionId)` indexes exist (they should — pre-existing). No new index likely needed; just close the open question.

---

### [INFO] Multi-tenant isolation: all new queries correctly target `tenantDb`
**Plan claims:** §7.8 every new query runs against `tenantDb` (per-org Neon branch); no cross-tenant path.
**Actual:** Confirmed against the code. `commission-calculator.service.ts` and `applyCommissionCaps`/liability/ledger/review all take `tenantDb` (`NeonDatabase<typeof tenantSchema>`); the only control-panel access is the best-effort **name enrichment** in `liabilityByStaff` (2688) and `listPendingReview` (2414) via `controlPanelDb` for `user.name` — a read-only, ID-keyed lookup, correct and unchanged. New tables (`commission_tracks`, `commission_track_rates`, `commission_track_versions`) are tenant-schema tables per §3.3. No cross-tenant leakage introduced. One nit: name-enrichment lookups are per-call `import()` + `IN (userIds)` — bounded by page size, fine.
**File:** `packages/services/src/commission-splits.service.ts:1686-1689, 2414-2417`; plan.md §7.8 (line 332)
**Fix:** None. Isolation is sound.

---

## Summary

The plan's §7 checklist is directionally good but **over-claims correctness on the two hardest concurrency/constraint points and under-specifies three index/constraint changes.**

Two CRITICALs are pre-existing DB constraints the plan never reconciles:
1. The existing `commission_splits_so_staff_unique (sales_order_id, staff_id)` partial unique index **physically blocks the track-stacking** that Journey B requires, and will silently drop the closer's sales commission (a domain-invariant violation) — the plan's new `(order, track, staff)` index is additive and does not replace the blocking one. The Phase-3 migration must DROP/replace the old index with a sequenced backfill of `track_id` onto legacy delivery rows.
2. The `commission_splits_must_target_one` CHECK forbids the package/installment origination targets §3.4 names; package-origination inserts will throw 23514 (not the caught 23505) and hard-fail the on-sale path. The CHECK must be relaxed and §8 Q2 resolved first.

The HIGHs: (3) §7.6 falsely claims 23505 mitigates the cap read-then-write race — it does not (the unique index is on identity, not the SUM); under concurrent earns the per-cycle cap can be exceeded, and the cap SUM currently has no `track_id` predicate so per-track caps will leak across tracks. (4) per-track context loading is 3×N_tracks queries, not the "one query each" §7.3 claims (bounded/acceptable but mis-stated). (5) the clawback/reversal fetch is unbounded `IN (orderIds)` and grows multiplicatively with stacked tracks.

MEDIUMs are missing indexes: review grouping needs `(status, role_type, track_id)` (only `track_id` is listed); the hot-path cap aggregate needs `(staff_id, earned_at)` and a `track_version_id` index (neither listed). Multi-tenant isolation (INFO) is sound.

**Priority order to fix before build:** the two CRITICAL DB-constraint reconciliations (index replacement + CHECK relax with §8 Q2/Q1 resolved) → the cap race honesty + `track_id` cap predicate (HIGH #3) → the two missing-index sets (MEDIUM) → context-load batching note (HIGH #4) → clawback bound (HIGH #5).
