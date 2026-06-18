# Doc Consistency Audit
**Session:** 05-30_15-23_commission-tracks
**Findings:** 11 (1 C · 1 H · 4 M · 3 L · 2 I)

## Findings

### [CRITICAL] Both `_design/*.html` "source of truth" docs are missing
**Plan claims:** Line 3 header: "Source of truth for design: `_design/commission-calculator-refactor.html` (the gather→plan→persist refactor) and `_design/commission-architecture-brainstorm.html` (the tracks model, schema, UI/UX, scaling story). This plan turns those into buildable phases."
**Actual:** There is no `_design/` folder in the session at all. Session contains only `META.md`, `plan/plan.md`, and `gaps/`. A repo-wide search for either filename returns nothing.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:3
**Fix:** Either restore the two design HTML docs into `zplan/05-30_15-23_commission-tracks/_design/`, or strike the "source of truth" line and re-anchor the plan to itself. As written, every "see design" justification (tracks model, UI/UX, scaling story) points at vapor — a reviewer cannot validate the schema/UX decisions against the cited source. This does not block code, but it breaks the plan's stated traceability contract, so flagged CRITICAL per the "doc doesn't exist" rule.

---

### [HIGH] Web routes `dashboard/settings/commissions` and `dashboard/operations/commissions` do not exist and are described as already existing
**Plan claims:** Journey A step 1 (line 209) "navigates to `/dashboard/settings/commissions`" and "Where it lives: the existing commission settings page" (line 213). Journey C step 1 (line 227) "Navigates to `/dashboard/operations/commissions`" and "Where it lives: the existing commission review page" (line 229). §5 Phase 3.5/3.7 Files list (line 274) treats `dashboard/settings/commissions` + `dashboard/operations/commissions` as edit targets.
**Actual:** Neither route exists. Actual commission routes are:
- `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/view.tsx` (the All/Review/Liability/Payouts tabs page)
- `apps/web/src/routes/_authenticated/dashboard/_layout/commissions/my.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/commission-cycles.tsx`
- `apps/web/src/routes/_authenticated/dashboard/_layout/operations/approvals.tsx`
Commission setup form lives at `apps/web/src/components/forms/category-commission-form.tsx`; the review UI is `apps/web/src/components/pages/commissions/review-tab.tsx`. The api-surface lens's belief that these two paths are fictional is correct.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:209, 213, 227, 229, 274
**Fix:** Replace the two paths with the real ones. The tabbed track editor (Journey A) most plausibly extends `components/forms/category-commission-form.tsx` (or a new tab inside `commissions/view.tsx`); the grouped review inbox (Journey C) extends `components/pages/commissions/review-tab.tsx` under `commissions/view.tsx`. Decide whether the editor belongs in the existing settings flow or the `settings/commission-cycles.tsx` neighbour. This is HIGH because Phase 3 names these as concrete files to modify and the "inline, no navigation" promise (lines 213, 221, 229) depends on landing in the page that actually exists.

---

### [MEDIUM] Phase 2 migration number is an unresolved `NNNN` placeholder; next free number is 0082
**Plan claims:** §3.2.1 / Phase 2.1 (line 254) "Author tenant migration `packages/db/src/migrations/tenant/NNNN_commission_tracks.sql`". Phase 3.1 also implies further migrations without numbers.
**Actual:** Latest tenant migration is `0081_credit_point_ledger.sql`, so the tracks migration is `0082`. Per MEMORY, `0079`–`0081` are authored but "NOT yet rolled out to live tenants" — relevant to the rename risk below.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:254, 267, 270
**Fix:** Assign `0082_commission_tracks.sql`; number the Phase 3 attribution migration (`0083`) and the origination unique-index migration (`0084` or fold into 0083). Flagged because criterion 6 treats `NNNN` as an unresolved placeholder.

---

### [MEDIUM] §2.4 says per-cycle cap is "moved from config" to the track, but §2.5 / §6 / §3.4 keep reading the config-version path — confirm this is dual-path, not a contradiction
**Plan claims:**
- §3.3 schema (line 149): `maxPerCycleCents` is on `commission_tracks` with comment "per-track cap (moved from config)".
- Phase 2.4 (line 257): "Per-cycle cap now reads from the track."
- Phase 2.5 (line 258): "Update `applyCommissionCaps` to aggregate per `trackId` … keep `configVersionId` path working for historical rows."
- §6 row 4 (line 297): "the aggregate basis changes; historical splits with `configVersionId` must still count."
**Actual:** The current `applyCommissionCaps` (commission-splits.service.ts:322) caps via an INNER JOIN against `categoryCommissionConfigVersions` on `configVersionId` (lines 434–441); splits with NULL `configVersionId` are silently excluded (comment line 424). So the live cap basis is genuinely config-version-keyed today.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:149, 257, 258, 297
**Fix:** Not a hard contradiction, but the wording "moved from config" (line 149) reads as a one-way move while 2.5/§6 require both paths to coexist (new rows via `trackVersionId`, legacy rows via `configVersionId`). Reword line 149 to "per-track cap (new home; config-version cap retained for legacy rows)" so the dual-path requirement in 2.5 isn't undercut by the schema comment.

---

### [MEDIUM] §3.4 / §6 say calculator signatures are "unchanged through Phase 2" but Phase 2.4 changes what `loadCommissionContext` resolves (config→track) and Phase 2 adds new persisted columns
**Plan claims:** §3.4 (line 196) "keep their existing signatures through Phase 2 (callers unchanged)". §6 row 1 (line 294) "Signature unchanged in P1/P2 → no caller break."
**Actual:** This is internally consistent for the *public* entry points (`calculateCommissionForAppointment`/`calculateCommissionForPos` exist at commission-calculator.service.ts:61/190 and the plan keeps their public arity). However Phase 2.4 changes the *internal* `loadCommissionContext` to resolve a track instead of a config, and Phase 2.3 renames `trainer-tiers.ts`→`earner-tiers.ts`. The "callers unchanged" claim holds only because of the Drizzle re-export shim (line 256, 322) — which the plan does mention.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:196, 294
**Fix:** Minor: clarify "public signatures unchanged; internal context resolution and persisted columns DO change." The claim is defensible but a reader skimming §6 row 1 could wrongly assume Phase 2 is caller-transparent including schema readers (it is not — `commission_splits` gains 3 columns and `trainer_tiers` is renamed).

---

### [MEDIUM] §2.3 "repoint coach slots" omits the `coach_slots_config_slot_unique` index, which must also move to `trackId`
**Plan claims:** Phase 2.3 (line 256) "repoint `commission-coach-slots.ts`"; §3.3 (line 180) "coach slots repointed to a (delivery) track". §6 row 3 (line 296) covers the FK repoint and the 10000bp invariant.
**Actual:** `commission-coach-slots.ts` has not just `configId` (line 6) but a `uniqueIndex("coach_slots_config_slot_unique").on(configId, slotIndex)` (line 14) and `index("coach_slots_config_idx")` (line 15). Repointing `configId`→`trackId` requires migrating BOTH indexes, or the per-track slot uniqueness guard is lost.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:180, 256, 296
**Fix:** Add to Phase 2.1/2.3 explicit text: "rebuild `coach_slots_config_slot_unique` and `coach_slots_config_idx` on `(trackId, slotIndex)` / `(trackId)`." Otherwise the migration leaves dangling indexes on a dropped/repointed column.

---

### [LOW] §3.4 places `listPendingReview` in `commission-splits/review.procedures.ts`; the function lives in the service, the router only wraps it
**Plan claims:** §3.4 (line 199) "extend `commission-splits/review.procedures.ts` `listPendingReview` to accept `trackId?`/`roleType?`". Phase 3.7 (line 273) "extend `listPendingReview`".
**Actual:** The procedure file `review.procedures.ts` imports and wraps `listPendingReview` (review.procedures.ts:6, :39); the actual function is defined in `commission-splits.service.ts:2363`. To add `trackId?`/`roleType?` you must edit BOTH the service function and the router's Zod input + the row mapper.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:199, 273
**Fix:** Note that the filter must be threaded service-side (`commission-splits.service.ts`) in addition to the procedure file. Not blocking — both files are in scope — but the plan's Files line for 3.7 (line 273) lists only `review.procedures.ts`, missing the service.

---

### [LOW] §8 Q5 (`shared` poolPolicy) and Q3 (cross-track cap) are answered elsewhere in the same plan — they are "flagged decisions," not truly open
**Plan claims:** §8 lists 6 "Open Questions / Risks." Q3 (line 342) "Cross-track cap … is pinned to per-track; confirm finance agrees." Q5 (line 344) "`shared poolPolicy` … only `separate` implemented in P3; `shared` deferred."
**Actual:** Q3 is already resolved in §6 Blocking prerequisites (line 304: "Per-track vs cross-track cap confirmed = per-track (pinned)") and Domain Brief. Q5 is a stated scope decision (defer `shared`), not an open question. These are decisions-awaiting-stakeholder-ack, not unknowns.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:342, 344, 304
**Fix:** Relabel Q3/Q5 as "Decisions (pending finance ack)" to distinguish from genuinely open Q1 (totalAmount net?) and Q2 (trigger site) which block 3.3/3.4. Consistency check between §6 prereqs and §8: Q1↔prereq(a) and Q2↔prereq(b) align correctly; Q3↔prereq(c) align correctly. Good.

---

### [LOW] §6 Blocking prerequisites (a)/(b) and §8 Q1/Q2 are the real gates but are stated as still-unresolved — verify before Phase 3 estimation
**Plan claims:** §8 Q1 (line 340) "Is `sales_orders.totalAmount` net? Resolve before 3.3." Q2 (line 341) "Exact on-sale trigger site … Resolve before 3.4."
**Actual:** `sales_orders.totalAmount` exists (sales-orders.ts:35, `total_amount integer NOT NULL`) but the plan has NOT determined whether it is gross or net — this is genuinely open and correctly flagged. The on-sale trigger site (`pos.service.ts` exists) is likewise un-pinned. Both are legitimately open and consistent between §6 and §8.
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:340, 341
**Fix:** None — correctly open. Listed for completeness: these are the two real prerequisites; resolve before committing Phase 3.

---

### [INFO] §2 Result ↔ §4 Journeys ↔ §5 acceptance criteria are consistent
**Plan claims:** §2 (lines 46–67) describes manager tabbed editor, cashier "Sold by", review grouping, trainer/sales payout segmentation.
**Actual:** Maps cleanly: §2 manager↔Journey A (Phase 3.5 acceptance line 276), §2 cashier↔Journey B (Phase 3.2/3.4 line 276), §2 review↔Journey C (Phase 3.7 line 276), §2 trainer unchanged↔Journey D (Phase 1/2 behavior-diff acceptance lines 249, 261), §2 payout segmentation↔Phase 4.2 (line 286). No journey is orphaned and no Result bullet lacks a phase. Phase dependency chain (P1 standalone → P2 needs P1 → P3 needs P2 with 3.1 gating 3.2–3.4 → P4 needs P3) is sound and matches §6 Deployment coupling (line 302).
**File:** zplan/05-30_15-23_commission-tracks/plan/plan.md:46-67, 203-233, 302
**Fix:** None.

---

### [INFO] All other cited source symbols and paths verified present
**Actual:** Confirmed existing: `commission-calculator.service.ts` (`_buildSplits`:311, `calculateCommissionForAppointment`:61, `calculateCommissionForPos`:190, `requireTrainerRole`:308); `commission-math.ts` (`assertConfigSumIs10000`:32, `dedupeBySlotIndex`:50, `computeEffectiveWeightages`:68, `computeFinalAmountCents`:104); `commission-splits.service.ts` (`applyCommissionCaps`:322, `createCommissionSplit`:508, `liabilitySummary`:1036, `liabilityByStaff`:1570, `listCommissionLedger`:1750, `getLatestConfigVersionForCategory`:1925, `reverseForRefund`:2053, `listPendingReview`:2363, `LIABILITY_BY_STAFF_LIMIT=500`:1540); all 4 `commission-splits/*.procedures.ts`; all 6 tenant schema files (`commission-coach-slots`, `commission-tier-rates`, `commission-splits`, `trainer-tiers`, `category-commission-configs`, `sales-orders`); `category-commission-config-versions.ts`; `members.trainerTierId` FK→`trainerTiers` (§6 row 2 accurate); the `configVersionId` INNER JOIN cap-trap (lines 434–441, gotcha #2 accurate); `run-integration-isolated.ts`; `migrate-all-tenants.ts`; all 3 e2e specs in 4.3 (`commissions-liability-tab`, `commissions-liability-csv-export`, `commissions-bulk-approve-invariants`). To-be-created paths correctly absent today: `packages/services/src/commission/` dir, `packages/api/src/routers/commission-tracks/`, `commission_track_management` permission resource, `soldBy`/`leadSource` columns on `sales_orders`.
**File:** —
**Fix:** None.

---

## Summary
The plan is structurally sound and its symbol/dependency claims are overwhelmingly accurate — the calculator math, cap INNER-JOIN trap, FK targets, service functions, e2e specs, and the P1→P2→P3→P4 dependency chain all check out against the codebase. Two findings need action before execution:

1. **CRITICAL** — the two `_design/*.html` "source of truth" docs the plan is built on do not exist anywhere in the repo; restore them or de-cite them.
2. **HIGH** — the web routes `dashboard/settings/commissions` and `dashboard/operations/commissions` (Journeys A & C, Phase 3.5/3.7 file targets) are fictional; real targets are `commissions/view.tsx` + `components/pages/commissions/review-tab.tsx` + `components/forms/category-commission-form.tsx`. The api-surface lens flagged this correctly.

MEDIUM items are tractable wording/scope fixes: assign migration number 0082 (replace `NNNN`), reconcile the "cap moved from config" wording with the required dual config/track cap path, clarify "signatures unchanged = public only," and add the coach-slot unique-index repoint to Phase 2. The §8 open questions are correctly split — Q1 (totalAmount net?) and Q2 (trigger site) are genuinely open and gate Phase 3; Q3 and Q5 are already-made decisions mislabeled as open. No false "DONE" markers, no contradictory invariants, math correctly declared off-limits.
