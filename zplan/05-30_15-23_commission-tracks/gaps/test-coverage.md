# Test Coverage Audit
**Session:** 05-30_15-23_commission-tracks
**Findings:** 11 (2C · 4H · 3M · 1L · 1I)

## Findings

### [CRITICAL] Proportional origination clawback (3.6) has ZERO test coverage for a money mutation
**Plan claims:** §5 Phase 3 task 3.6 + §7 Testing "clawback proportionality": "a refund / package cancellation / installment default on an order with paid origination commission writes a **proportional negative `commission_split_reversals`** row (`reversal = -paid × refundedAmountCents / totalAmount`)." Acceptance: "refunding the package writes a proportional clawback."
**Actual:** No test file names this path. The only reversal/clawback tests are `apps/server/src/tests/unit/services/refunds.test.ts` (covers `listRefunds`, `approveRefund`, `bulkApproveRefunds` — refund APIs, NOT commission reversal proportionality) and `apps/server/src/tests/integration/dispute-voids-unpaid.integration.test.ts` (voids unpaid splits on dispute — the existing delivery-shaped path the plan explicitly says does NOT cover origination timing, see Domain gotcha #6). The proportional-clawback formula is a new financial computation with no unit or integration test named anywhere in §5 or §7. This is a money mutation that can over- or under-claw a closer's already-paid commission.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:272, 316
**Fix:** Name a pure unit test for the proportionality formula (it should be extractable as a pure helper like `computeReversalCents(paid, refundedAmountCents, totalAmount)` so it is DB-free and exhaustively testable — rounding direction on the floor/ceil matters for cents) AND an integration test asserting the negative `commission_split_reversals` row amount for partial vs full refund of an order with a paid origination split. Add both to §5/3.6 acceptance and §7.
---

### [CRITICAL] Track-aware origination idempotency (3.4) — "10-session package fires sales once" has no named test
**Plan claims:** §7 Testing: "Integration: ... idempotency (10-session package → 1 sales split)." Domain gotcha #4: "origination once at sale ... Idempotency must be track-aware or sales commission double-fires." Task 3.4 adds partial unique index `commission_splits_origination_unique ON (sales_order_id, track_id, staff_id) WHERE track_id IS NOT NULL` + 23505 skip.
**Actual:** §7 mentions this under "Integration" but §5 Phase 3 acceptance does not bind it to a named test file, and no existing test covers origination idempotency. The closest existing test, `commission-dedup-pos-vs-appointment.integration.test.ts`, is explicitly scoped to the *delivery* dedup guard (POS-vs-appointment double-count) and its own header documents a LIMITATION: it only asserts DB-state invariants, not the production `updateAppointment` path. It does NOT exercise the new origination unique index or the on-sale trigger firing once across a multi-session package. A double-fire here pays the closer N× — a financial state-changing bug.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:270, 316
**Fix:** Add a named integration test (e.g. `commission-origination-idempotency.integration.test.ts`) that fires the on-sale trigger twice for the same (salesOrderId, trackId, staffId) and asserts exactly one sales split (23505 skip path). Bind it to 3.4 acceptance. Must run under `run-integration-isolated.ts` per process-isolation note.
---

### [HIGH] Phase 1 behavior-diff harness under-specifies how the pre-refactor engine is captured
**Plan claims:** §5 task 1.5: "a **behavior-diff harness**: run the pre-refactor engine (git-stashed copy or a captured fixture set of real splits) vs the new engine over a corpus of appointment/POS inputs; assert identical output rows." Goal #3: "Zero behavior change ... proven by an old-vs-new output-diff test."
**Actual:** The "git-stashed copy OR captured fixture set" is left as an unresolved either/or — and task 1.4 deletes `_buildSplits` ("delete `_buildSplits`"). You cannot diff against an engine you have deleted. A git-stash copy is not a runnable artifact once the branch is committed; importing two live engines into one process collides with Bun's process-global `mock.module` (per project memory). No corpus source, no fixture-capture step, and no golden-file location are specified. There is no existing captured-output fixture for commission splits in the repo to seed this.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:246, 38
**Fix:** Make capture an explicit first step: BEFORE 1.4 deletes `_buildSplits`, add a task to run the current engine over a fixed corpus and serialize the output split rows to a committed golden fixture (e.g. `apps/server/src/tests/fixtures/commission-baseline.json`). The harness then diffs the new engine against that frozen JSON — no two-engine-in-one-process problem, no reliance on git stash. Specify corpus composition (each skip reason, redistribution case, cap case, POS threshold + appointment operator modes) and the golden-file path.
---

### [HIGH] New integration tests will inherit the `pg`-driver hang risk — pattern not specified
**Plan claims:** §7 Testing: "Integration: ... Run via `run-integration-isolated.ts` (process isolation)." Phase tasks reference `integration-setup.ts` helpers (`createTenantDb`, `makeIntegrationAdminContext`).
**Actual:** `apps/server/src/tests/helpers/integration-setup.ts` was migrated to a `pg` Pool (lines 8, 87-108, 159-165). The file's own comments now claim `pg` over TCP is "solid" and the prior hang was mitigated with `idle_in_transaction_session_timeout`/`lock_timeout`/`withTxTimeout`. HOWEVER project memory records that this migration HANGS, and the functional `audit-prove-deferred.integration.test.ts` (lines 1-9, 24-28, 67) deliberately bypasses `createTenantDb` and builds its OWN `@neondatabase/serverless` WS pool because the `pg` path was unreliable under bun:test for throw-in-transaction / rollback cases. The plan's new clawback + idempotency integration tests involve transaction rollback paths (23505 skip, reversal txns) — exactly the scenario the memory flags as wedging. The plan does not say which transport new tests should use.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:316; apps/server/src/tests/helpers/integration-setup.ts:8
**Fix:** Decide and document the transport before Phase 1: either (a) confirm the `pg` `withTxTimeout`/lock-timeout mitigation actually holds for rollback-heavy commission tests by running the existing commission integration suite green via `run-integration-isolated.ts`, or (b) follow the `audit-prove-deferred` Neon-serverless WS pool pattern for the new clawback/idempotency tests. Add a one-line note in §7 naming the chosen transport so authors don't default to the hanging `createTenantDb`.
---

### [HIGH] e2e route paths in Journeys A/C don't match the actual route — specs the plan updates live elsewhere
**Plan claims:** Journey A (§4): "Manager navigates to `/dashboard/settings/commissions`." Journey C: "Navigates to `/dashboard/operations/commissions`." Task 3.5/3.7 + Phase 4 4.3 update web pages at those paths.
**Actual:** The real route is `/dashboard/commissions/view` (single page, tabbed via `?tab=`). Source: `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx` and `my.tsx` — there is no `settings/commissions` or `operations/commissions` route. All three existing e2e specs the plan names confirm this: `commissions-liability-tab.journey.spec.ts:8` navigates `/dashboard/commissions/view?tab=liability`, `commissions-bulk-approve-invariants.journey.spec.ts:18` uses `?tab=all`, `commissions-liability-csv-export.journey.spec.ts:13` uses `?tab=liability`. If implementers build the new track config editor / review grouping at the planned (non-existent) paths, the updated e2e specs won't find them and the existing specs break.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:206, 226, 229, 213; apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx
**Fix:** Correct Journeys A/B/C and tasks 3.5/3.7/4.3 to the real `/dashboard/commissions/view` route (add tabs there) OR explicitly justify creating new routes and note the existing specs must be re-pointed. Reconcile "settings" (config) vs "operations" (review) split against the single existing page.
---

### [HIGH] `origination-plan.ts` pure unit tests — net/gross basis fixtures depend on an UNRESOLVED open question
**Plan claims:** §7 Testing "Unit: ... `origination-plan.ts` — pure, exhaustive." Task 3.3: basis resolution `net_order` = `sales_orders.totalAmount` (verify post-discount; else derive from line items minus promotions).
**Actual:** The pure planner's correctness hinges on Open Question #1 (§8:340) — "Is `sales_orders.totalAmount` net?" — which is UNRESOLVED and gated "Resolve before 3.3." If totalAmount is gross, the basis must be derived from `sales_order_items` minus `payment_items.promotionId` discounts, which changes the planner's inputs and therefore the fixtures the unit tests need. Writing "exhaustive" pure tests against the wrong basis shape produces tests that pass but compute the wrong commission. The fixtures for sales orders / line items / promotions exist (`fixtures.ts` has package/order factories) but no sales-order-with-promotion fixture is confirmed for the net-derivation branch.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:314, 269, 340
**Fix:** Resolve OQ#1 before authoring `origination-plan.test.ts`; have the test cover BOTH gross and net (post-promotion) inputs explicitly with a fixture that includes a `payment_items.promotionId` discount, so the basis-derivation branch is exercised regardless of the answer.
---

### [MEDIUM] Phase 2 per-track cap aggregate (2.5) — the NULL-trackVersionId silent-drop trap has no named test
**Plan claims:** Task 2.5: "Update `applyCommissionCaps` to aggregate per `trackId` ... via the `trackVersionId` INNER JOIN analog; keep `configVersionId` path working." §6 breakage: "A NULL `trackVersionId` would silently drop a split from the cap aggregate (same trap as `configVersionId`)."
**Actual:** This is the exact trap called out in Domain gotcha #2 — an INNER JOIN against the version table silently excludes splits with a NULL version id from the cap aggregate, meaning a capped earner could be OVER-paid. `commission-versioning.integration.test.ts` exists and covers the current `configVersionId` cap path, but no test is named to assert the new `trackVersionId` cap aggregate or the legacy-NULL-as-delivery fallback. A silent cap miscalculation is a financial state bug. Not CRITICAL only because an existing versioning test partially guards the analogous config path and 2.5 says to keep it working.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:258, 297, 21
**Fix:** Bind 2.5 acceptance to an integration test asserting (a) a split with a valid `trackVersionId` is included in the per-track cap aggregate, and (b) a historical split with NULL `trackVersionId`/`trackId` is treated as legacy-delivery and still counted, not silently dropped.
---

### [MEDIUM] `plan.ts` pure unit tests — helper imports exist, but loader-fetched fixtures (MemberSnapshot map) are new and unspecified
**Plan claims:** Task 1.5: "`commission/plan.test.ts` (pure unit tests for every skip reason + redistribution + rounding)." `PlanInput` requires `members: Map<string, MemberSnapshot>` "pre-fetched by loader (role, tier)".
**Actual:** The pure-math helpers the planner reuses (`dedupeBySlotIndex`, `computeEffectiveWeightages`, `computeFinalAmountCents`, `assertConfigSumIs10000`, `SlotConfig`, `StaffAssignment`) DO exist and are already unit-tested in `packages/services/src/commission-math.test.ts`, so the arithmetic side is supported. BUT the new `CommissionContext`/`PlanInput`/`MemberSnapshot`/`RateTable` types (§3.1) are introduced in Phase 1 and have no existing fixture factory — `fixtures.ts` has no commission-context or member-snapshot builder. The plan does not name where the planner's input fixtures come from, so each skip-reason case (`member_not_found`, `role_mismatch`, `no_tier`, `no_tier_rate`, `no_condition_rate`) must be hand-built. This is achievable (pure, no DB) but unscoped.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:243, 246, 88-112
**Fix:** Add a tiny in-file or `fixtures.ts` factory for `CommissionContext` + `PlanInput` so all six `SkipReason` variants are constructed cheaply; list it as a 1.2/1.5 sub-task. Confirm these are pure objects (no DB) so they need no integration-setup.
---

### [MEDIUM] Phase 2 migration idempotency + `trainer_tiers`→`earner_tiers` rename has no migration test named
**Plan claims:** Phase 2 acceptance: "migration applies idempotently on a fresh + a seeded tenant; `verify:migrations` green; ... `drift-check` green." §8 risk #4: the rename is "the single riskiest migration."
**Actual:** `apps/server/src/tests/integration/tenant-migrate.integration.test.ts` exists (matched the migration grep) and presumably exercises `runTenantMigrations`, but the plan does not bind the new `NNNN_commission_tracks.sql` rename/backfill to a re-run idempotency assertion (apply twice → no error, no duplicate trainer track). A half-applied rename mid-rollout (the documented risk) is verified only by manual browser check in acceptance. `verify:migrations` checks generated-module sync, not runtime idempotency on a seeded tenant.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:261, 254, 343
**Fix:** Add an integration assertion (extend `tenant-migrate.integration.test.ts` or a new file) that runs the tracks migration twice against a seeded tenant and asserts: rename is no-op on second run, exactly one trainer track per category (backfill idempotent skip), coach slots repointed, sum=10000bp invariant holds (`assertConfigSumIs10000`).
---

### [LOW] Phase 4 reporting segmentation (4.2) relies on existing e2e specs that don't yet assert a track dimension
**Plan claims:** Task 4.3: "Update existing e2e specs (`commissions-liability-tab`, `commissions-liability-csv-export`, `commissions-bulk-approve-invariants`) for the track dimension."
**Actual:** All three specs CONFIRMED to exist and cover what the plan assumes: `commissions-liability-tab.journey.spec.ts` (KPI band + API cross-check + filters), `commissions-liability-csv-export.journey.spec.ts` (asserts the exact CSV header row: `"Trainer","Approved Unpaid (RM)","Paid (RM)","Manual Adj (RM)","Net Payable (RM)"`), `commissions-bulk-approve-invariants.journey.spec.ts` (mixed-staff frontend guard). The CSV header assertion is hard-coded to the current columns and uses "Trainer" — adding a track column (4.2) WILL break this spec's line-7 assertion. The plan flags the update but doesn't note the column-header break is a guaranteed edit, not optional.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:283; e2e/commissions-liability-csv-export.journey.spec.ts:19
**Fix:** Note in 4.3 that the CSV header assertion in `commissions-liability-csv-export.journey.spec.ts` and the "Trainer" label must change concurrently with the export column addition (deploy-coupled), else the spec fails the moment 4.2 ships.
---

### [INFO] Phase 1 pure-math reuse is well-covered; calculator entry-point integration tests exist
**Plan claims:** "Do not touch the arithmetic" (gotcha #1); reuse `commission-math.ts` verbatim.
**Actual:** Confirmed solid foundation: `commission-math.test.ts` exhaustively unit-tests the three audit-referenced behaviors (multiply-then-floor, sum=10000bp, dedupe-by-slotIndex). `commission-calculator.integration.test.ts` exercises `calculateCommissionForAppointment` end-to-end against a real tenant, and `pos-commission.integration.test.ts` covers the POS path (`requireTrainerRole: false`). These give the behavior-diff corpus real seeds and confirm the public signatures the plan promises to keep stable (§3.4) are already under test. `run-integration-isolated.ts` exists as promised for process isolation.
**File:** packages/services/src/commission-math.test.ts; apps/server/src/tests/integration/commission-calculator.integration.test.ts
**Fix:** None — leverage these as the behavior-diff corpus source (see HIGH finding on harness capture).
---

## Summary

The plan's Phase 1 (pure refactor) is well-supported by existing tests — `commission-math.test.ts`, the calculator integration tests, and the `run-integration-isolated.ts` runner all exist. The two CRITICAL gaps are **financial mutations with zero named test coverage**: proportional origination clawback (3.6) and track-aware origination idempotency (3.4, "10-session package fires sales once"). Both compute/guard real money and have no unit or integration test bound to their acceptance criteria; the existing refund/dedup tests are explicitly delivery-shaped and do not cover the new origination timing (the plan itself flags this in Domain gotcha #4 and #6).

Top structural risks: (HIGH) the Phase 1 behavior-diff harness can't diff against `_buildSplits` once 1.4 deletes it — the plan must capture a frozen golden fixture BEFORE deletion and pick a single transport. (HIGH) `integration-setup.ts` was migrated to a `pg` pool that project memory says HANGS on rollback; new clawback/idempotency tests (rollback-heavy) must either prove the `pg` mitigation holds or follow the `audit-prove-deferred` Neon-WS pattern — the plan is silent on this. (HIGH) Journeys A/C target routes (`/dashboard/settings/commissions`, `/dashboard/operations/commissions`) that don't exist — the real route is `/dashboard/commissions/view`, where all three named e2e specs actually run; building at the planned paths breaks them.

All three e2e specs the plan says it will update were confirmed to exist and match their described behavior. The CSV-export spec hard-codes the column header and label "Trainer", so 4.2's track column is a guaranteed (deploy-coupled) spec edit, not optional.

Recommended actions before execution: (1) add named unit+integration tests for clawback proportionality and origination idempotency and bind them to 3.6/3.4 acceptance; (2) insert a "capture baseline golden fixture" task before 1.4; (3) decide and document the integration test transport in §7; (4) correct the route paths in Journeys A/B/C and tasks 3.5/3.7/4.3.
